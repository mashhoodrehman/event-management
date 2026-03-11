// controllers/reminder.controller.js
const { Op } = require("sequelize");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
// const MessageTemplate = require("../models/messageTemplate.model"); // no longer needed here
const ReminderAutomationSchedule = require("../models/reminderAutomationSchedule.model");
const ReminderAutomation = require("../models/reminderAutomation.model");
const { enqueueAutomationJob } = require("../queues/automationQueue");

const PER_TASK_DELAY_MS = 4 * 1000; // 4 seconds between each reminder

/**
 * GET /api/reminders?eventId=123
 */
const getRemindersByEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const schedules = await ReminderAutomationSchedule.findAll({
      where: { eventId },
      order: [["sendDateTime", "ASC"]],
    });

    return res.status(200).json({
      reminders: schedules,
    });
  } catch (err) {
    console.error("getRemindersByEvent error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * POST /api/reminders
 * Body: { eventId, name, messageText, sendDateTime, targetAudience?, channel?, isActive? }
 *
 * NOTE:
 *  - No templateId/customText anymore. We store the final message text directly.
 */
const createReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      eventId,
      name,
      messageText,
      sendDateTime,
      targetAudience = "confirmed",
      channel = "whatsapp",
      isActive = true,
    } = req.body;

    if (!eventId || !name || !messageText || !sendDateTime) {
      return res.status(400).json({
        error: "eventId, name, messageText and sendDateTime are required",
      });
    }

    const trimmedText = String(messageText).trim();
    if (!trimmedText) {
      return res.status(400).json({ error: "messageText cannot be empty" });
    }

    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const sendAt = new Date(sendDateTime);
    if (isNaN(sendAt.getTime())) {
      return res.status(400).json({ error: "Invalid sendDateTime" });
    }

    // pick audience
    let guestWhere = { eventId };
    if (targetAudience === "confirmed") {
      guestWhere = { ...guestWhere, status: "confirmed" };
    }
    const guests = await Guest.findAll({ where: guestWhere });

    if (!guests.length) {
      return res
        .status(400)
        .json({ error: "No guests found for this reminder audience" });
    }

    // ---------------- New timing logic ----------------
    const nowServer = new Date();
    let baseTime = sendAt;

    const isSameDay = sendAt.toDateString() === nowServer.toDateString();

    // If date is today → start from now + 1 minute
    if (isSameDay && sendAt <= nowServer) {
      baseTime = new Date(nowServer.getTime() + 60 * 1000);
    }
    // --------------------------------------------------

    // create schedule row (store the actual first send time we will use)
    const schedule = await ReminderAutomationSchedule.create({
      eventId,
      name,
      messageText: trimmedText,
      channel,
      targetAudience,
      sendDateTime: baseTime,
      isActive,
      plannedRecipients: guests.length,
      sentCount: 0,
    });

    // create ReminderAutomation rows (one per guest) with 4s gaps
    const reminderRows = guests.map((g, index) => {
      const scheduledAt = new Date(
        baseTime.getTime() + index * PER_TASK_DELAY_MS
      );
      return {
        guestNumber: g.phone,
        rsvpToken: g.rsvpToken,
        status: "pending",
        scheduledAt,
        eventId,
        scheduleId: schedule.id,
      };
    });

    const tasks = await ReminderAutomation.bulkCreate(reminderRows, {
      returning: true,
    });

    // enqueue automation jobs
    const type = channel === "whatsapp" ? "REMINDER_WHATSAPP" : "REMINDER_SMS";

    await Promise.all(
      tasks.map((t) =>
        enqueueAutomationJob({
          type,
          modelName: "reminder",
          taskId: t.id,
          scheduledAt: t.scheduledAt,
        })
      )
    );

    return res.status(201).json({
      message: "Reminder created and scheduled successfully",
      reminder: schedule,
      createdTasks: tasks.length,
    });
  } catch (err) {
    console.error("createReminder error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * PUT /api/reminders/:id
 * Body: { name?, messageText?, sendDateTime?, targetAudience?, channel?, isActive? }
 *
 * Rules:
 *  - Only future reminders (sendDateTime > now) can be edited
 *  - Regenerates ReminderAutomation rows for this schedule
 *  - messageText, if provided, overrides the existing one
 */
const updateReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name,
      messageText,
      sendDateTime,
      targetAudience,
      channel,
      isActive,
    } = req.body;

    const schedule = await ReminderAutomationSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    const event = await Event.findOne({
      where: { id: schedule.eventId, userId },
    });
    if (!event) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const now = new Date();
    if (new Date(schedule.sendDateTime) <= now) {
      return res.status(400).json({
        error: "Cannot edit a reminder that has already started / passed.",
      });
    }

    // new send time (if provided)
    const newSendAt = sendDateTime ? new Date(sendDateTime) : null;
    if (sendDateTime && isNaN(newSendAt.getTime())) {
      return res.status(400).json({ error: "Invalid sendDateTime" });
    }

    let finalSendDateTime = newSendAt || schedule.sendDateTime;
    const finalTargetAudience = targetAudience || schedule.targetAudience;
    const finalChannel = channel || schedule.channel;
    const finalName = name || schedule.name;
    const finalIsActive =
      typeof isActive === "boolean" ? isActive : schedule.isActive;

    // optional messageText override
    let finalMessageText = schedule.messageText;
    if (typeof messageText === "string") {
      const trimmed = messageText.trim();
      if (!trimmed) {
        return res
          .status(400)
          .json({ error: "messageText cannot be empty if provided" });
      }
      finalMessageText = trimmed;
    }

    // ---------------- New timing logic for update ----------------
    const nowServer = new Date();
    let baseTime = finalSendDateTime;

    const isSameDay = baseTime.toDateString() === nowServer.toDateString();

    // If updated date is today & time is in the past, start from now + 1 minute
    if (isSameDay && baseTime <= nowServer) {
      baseTime = new Date(nowServer.getTime() + 60 * 1000);
    }
    // -------------------------------------------------------------

    // recalculate audience
    let guestWhere = { eventId: schedule.eventId };
    if (finalTargetAudience === "confirmed") {
      guestWhere = { ...guestWhere, status: "confirmed" };
    }
    const guests = await Guest.findAll({ where: guestWhere });
    if (!guests.length) {
      return res
        .status(400)
        .json({ error: "No guests found for this reminder audience" });
    }

    // update schedule row
    schedule.name = finalName;
    schedule.messageText = finalMessageText;
    schedule.channel = finalChannel;
    schedule.targetAudience = finalTargetAudience;
    schedule.sendDateTime = baseTime; // store actual starting time
    schedule.isActive = finalIsActive;
    schedule.plannedRecipients = guests.length;
    // NOTE: we don't touch sentCount here
    await schedule.save();

    // delete existing pending reminder tasks for this schedule
    await ReminderAutomation.destroy({
      where: {
        scheduleId: schedule.id,
        status: "pending",
      },
    });

    // create fresh tasks with 4s gap
    const reminderRows = guests.map((g, index) => {
      const scheduledAt = new Date(
        baseTime.getTime() + index * PER_TASK_DELAY_MS
      );
      return {
        guestNumber: g.phone,
        rsvpToken: g.rsvpToken,
        status: "pending",
        scheduledAt,
        eventId: schedule.eventId,
        scheduleId: schedule.id,
      };
    });

    const tasks = await ReminderAutomation.bulkCreate(reminderRows, {
      returning: true,
    });

    // enqueue new jobs
    const type =
      finalChannel === "whatsapp" ? "REMINDER_WHATSAPP" : "REMINDER_SMS";

    await Promise.all(
      tasks.map((t) =>
        enqueueAutomationJob({
          type,
          modelName: "reminder",
          taskId: t.id,
          scheduledAt: t.scheduledAt,
        })
      )
    );

    return res.status(200).json({
      message: "Reminder updated successfully",
      reminder: schedule,
      recreatedTasks: tasks.length,
    });
  } catch (err) {
    console.error("updateReminder error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * DELETE /api/reminders/:id
 * Only for future reminders
 */
const deleteReminder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const schedule = await ReminderAutomationSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    const event = await Event.findOne({
      where: { id: schedule.eventId, userId },
    });
    if (!event) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const now = new Date();
    if (new Date(schedule.sendDateTime) <= now) {
      return res.status(400).json({
        error: "Cannot delete a reminder that has already started / passed.",
      });
    }

    await ReminderAutomation.destroy({
      where: {
        scheduleId: schedule.id,
        status: "pending",
      },
    });

    await schedule.destroy();

    return res.status(200).json({ message: "Reminder deleted successfully" });
  } catch (err) {
    console.error("deleteReminder error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * PATCH /api/reminders/:id/toggle
 * Body: { isActive: boolean }
 */
const toggleReminderActive = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { isActive } = req.body;

    const schedule = await ReminderAutomationSchedule.findByPk(id);
    if (!schedule) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    const event = await Event.findOne({
      where: { id: schedule.eventId, userId },
    });
    if (!event) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    schedule.isActive = !!isActive;
    await schedule.save();

    return res.status(200).json({
      message: "Reminder status updated",
      reminder: schedule,
    });
  } catch (err) {
    console.error("toggleReminderActive error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getRemindersByEvent,
  createReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
};
