// controllers/automation.controller.js
const { Op } = require("sequelize");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const MessageTemplate = require("../models/messageTemplate.model");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const { enqueueAutomationJob } = require("../queues/automationQueue");

/**
 * POST /api/automation/manual-run
 *
 * Body:
 * {
 *   eventId: number,
 *   guestId: number,
 *   channel: "sms" | "whatsapp" | "ai_call" | "human_call",
 *   scheduleAt?: ISO string (optional, defaults to now)
 * }
 *
 * Creates a single automation task for this guest & channel,
 * then enqueues it into the queue.
 */
const manualRunAutomation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId, guestId, channel, scheduleAt } = req.body;

    if (!eventId || !guestId || !channel) {
      return res.status(400).json({
        error: "eventId, guestId and channel are required",
      });
    }

    const validChannels = ["sms", "whatsapp", "ai_call", "human_call"];
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        error: "Invalid channel. Must be sms, whatsapp, ai_call or human_call",
      });
    }

    // 1) Verify event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // 2) Load guest
    const guest = await Guest.findOne({
      where: { id: guestId, eventId },
    });

    if (!guest) {
      return res.status(404).json({ error: "Guest not found for this event" });
    }

    if (!guest.phone || !guest.rsvpToken) {
      return res.status(400).json({
        error: "Guest phone or RSVP token missing, cannot send automation",
      });
    }

    // 3) Load template (if you use same MessageTemplate for all channels)
    const template = await MessageTemplate.findOne({ where: { eventId } });

    const when = scheduleAt ? new Date(scheduleAt) : new Date();
    if (isNaN(when.getTime())) {
      return res.status(400).json({ error: "Invalid scheduleAt date" });
    }

    // 4) Choose model & queue metadata based on channel
    let Model;
    let typeKey; // for queue: "SMS" | "WhatsApp" | "AI_CALL" | "HUMAN_CALL"
    let modelName; // for worker info: "sms" | "whatsapp" | "ai" | "human"

    switch (channel) {
      case "sms":
        Model = SMSAutomation;
        typeKey = "SMS";
        modelName = "sms";
        break;
      case "whatsapp":
        Model = WhatsAppAutomation;
        typeKey = "WhatsApp";
        modelName = "whatsapp";
        break;
      case "ai_call":
        Model = AICallAutomation;
        typeKey = "AI_CALL";
        modelName = "ai";
        break;
      case "human_call":
        Model = HumanCallAutomation;
        typeKey = "HUMAN_CALL";
        modelName = "human";
        break;
      default:
        return res.status(400).json({ error: "Unsupported channel" });
    }

    // 5) Create automation record in DB
    const task = await Model.create({
      guestNumber: guest.phone,
      rsvpToken: guest.rsvpToken,
      templateId: template ? template.id : null,
      status: "pending",
      scheduledAt: when,
      eventId,
      round: 1,
    });

    // 6) Enqueue job in your Bull queue
    await enqueueAutomationJob({
      type: typeKey,
      modelName, // so worker knows which model to query
      taskId: task.id,
      scheduledAt: when,
    });

    return res.status(200).json({
      message: "Manual automation scheduled successfully",
      automationId: task.id,
      channel,
      scheduledAt: when.toISOString(),
    });
  } catch (err) {
    console.error("manualRunAutomation error:", err);
    return res
      .status(500)
      .json({
        error: err.message || "Server error while scheduling automation",
      });
  }
};

module.exports = { manualRunAutomation };
