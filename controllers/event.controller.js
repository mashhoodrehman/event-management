const crypto = require("crypto");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const EventSetting = require("../models/eventSetting.model");
const MessageTemplate = require("../models/messageTemplate.model");
const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Payment = require("../models/payment.model");

const xlsx = require("xlsx");

// ====================== STEP 1 ======================
const createOrUpdateEvent = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      eventId,
      name,
      typeId,
      eventDate,
      endDate,
      location,
      estimatedGuests,
      description,
    } = req.body;

    if (!name || !typeId || !eventDate || !location) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    // Helpers to work with *dates only* (no time)
    const toStartOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const diffInDays = (from, to) => {
      const msPerDay = 1000 * 60 * 60 * 24;
      return Math.floor((toStartOfDay(to) - toStartOfDay(from)) / msPerDay);
    };

    const today = toStartOfDay(new Date());
    const eventDateTime = new Date(eventDate);
    const eventDateObj = toStartOfDay(eventDateTime);
    let endDateObj = endDate ? toStartOfDay(endDate) : null;

    // Event must be at least 6 days after today (calendar days)
    const daysFromTodayToEvent = diffInDays(today, eventDateObj);

    if (daysFromTodayToEvent < 6) {
      return res
        .status(400)
        .json({ error: "Event date must be at least 6 days after today" });
    }

    // Default end date = exactly 3 days before event date if not provided
    if (!endDateObj) {
      endDateObj = new Date(eventDateObj);
      endDateObj.setDate(endDateObj.getDate() - 3);
    }

    const daysFromTodayToEnd = diffInDays(today, endDateObj);

    if (daysFromTodayToEnd < 3) {
      return res.status(400).json({
        error: "End date must be at least 3 days after today",
      });
    }

    // End date must be before event date
    // if (endDateObj >= eventDateObj) {
    //   return res
    //     .status(400)
    //     .json({ error: "End date cannot be on or after the event date" });
    // }

    // End date must be at least 3 full days before event date
    const daysFromEndToEvent = diffInDays(endDateObj, eventDateObj);

    if (daysFromEndToEvent < 3) {
      return res.status(400).json({
        error: "End date must be at least 3 days before event date",
      });
    }
    if (endDateObj >= eventDateObj) {
      return res
        .status(400)
        .json({ error: "End date cannot be on or after the event date" });
    }

    const invitationFile = req.file ? req.file.filename : null;
    let event;

    if (eventId) {
      event = await Event.findByPk(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      await event.update({
        name,
        typeId,
        eventDate: eventDateTime,
        endDate: endDateObj,
        location,
        estimatedGuests,
        description,
        invitationFile: invitationFile || event.invitationFile,
        status: "step1_completed",
      });
    } else {
      event = await Event.create({
        userId,
        name,
        typeId,
        eventDate: eventDateTime,
        endDate: endDateObj,
        location,
        estimatedGuests,
        description,
        invitationFile,
        status: "step1_completed",
      });
    }

    res.status(200).json({ message: "Step 1 completed", event });
  } catch (err) {
    console.error("Step 1 Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ====================== STEP 2 ======================
const addOrUpdateGuests = async (req, res) => {
  try {
    const { eventId, guestList } = req.body;
    const guestListFile = req.files?.guestListFile?.[0]?.path;

    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    let newGuests = [];
    let errors = [];
    let duplicates = new Set();
    let duplicateLogs = [];

    // ======== Normalize Phone Numbers ========
    const normalizePhone = (phone) => {
      if (!phone) return null;

      // Remove all non-digit characters
      phone = phone.replace(/[^\d+]/g, "");

      // Pakistan: 0333..., 333..., +92333...
      if (/^0?3\d{9}$/.test(phone)) {
        if (phone.startsWith("0")) phone = phone.slice(1);
        return "+92" + phone;
      }
      if (/^\+923\d{9}$/.test(phone)) return phone;

      // Israel: 05..., 5..., +9725...
      if (/^0?5\d{8}$/.test(phone)) {
        if (phone.startsWith("0")) phone = phone.slice(1);
        return "+972" + phone;
      }
      if (/^\+9725\d{8}$/.test(phone)) return phone;

      return null; // invalid
    };

    // ======== Process Excel Upload ========
    if (guestListFile) {
      const workbook = xlsx.readFile(guestListFile);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

      rows.forEach((row, index) => {
        const name = row[0] ? String(row[0]).trim() : null;
        const phoneRaw = row[1] ? String(row[1]).trim() : null;

        if (!name || !phoneRaw) {
          console.log(111111111);
          errors.push(`Row ${index + 1}: Missing ${!name ? "name" : "phone"}`);
          return;
        }

        const normalized = normalizePhone(phoneRaw);
        if (!normalized) {
          console.log(22222222);
          errors.push(`Row ${index + 1}: Invalid phone → ${phoneRaw}`);
          return;
        }

        if (duplicates.has(normalized)) {
          console.log(3333333333);
          duplicateLogs.push(`Row ${index + 1}: Duplicate phone → ${phoneRaw}`);
          return;
        }

        duplicates.add(normalized);
        newGuests.push({
          name,
          phone: normalized,
          eventId,
          status: "pending",
          rsvpToken: crypto.randomBytes(16).toString("hex"),
        });
      });
    }

    // ======== Process Manual Entry ========
    if (guestList) {
      const lines = guestList.split(/\n+/).filter((l) => l.trim());

      lines.forEach((line, index) => {
        // Remove invisible characters
        const cleanLine = line.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

        // Split by dash (-, –, —) with spaces
        const parts = cleanLine.split(/\s*[-–—]\s*/);
        if (parts.length !== 2) {
          errors.push(`Line ${index + 1}: Invalid format → "${line}"`);
          return;
        }

        const nameTrimmed = parts[0].trim();
        const phoneTrimmed = parts[1].trim().replace(/[^\d+]/g, "");

        if (!nameTrimmed || !phoneTrimmed) {
          errors.push(`Line ${index + 1}: Missing name or phone → "${line}"`);
          return;
        }

        const normalized = normalizePhone(phoneTrimmed);
        if (!normalized) {
          errors.push(`Line ${index + 1}: Invalid phone → ${phoneTrimmed}`);
          return;
        }

        if (duplicates.has(normalized)) {
          duplicateLogs.push(
            `Line ${index + 1}: Duplicate phone → ${phoneTrimmed}`
          );
          return;
        }

        duplicates.add(normalized);
        newGuests.push({
          name: nameTrimmed,
          phone: normalized,
          eventId,
          status: "pending",
          rsvpToken: crypto.randomBytes(16).toString("hex"),
        });
      });
    }

    // ======== Validation ========
    if (errors.length > 0) {
      return res.status(400).json({
        error: errors || "Invalid guest data",
        details: errors,
      });
    }

    // ======== Merge with Existing Guests ========
    const existingGuests = await Guest.findAll({
      where: { eventId },
      attributes: ["id", "name", "phone", "rsvpToken", "status"],
    });

    const existingMap = new Map(existingGuests.map((g) => [g.phone, g]));

    const toUpdate = [];
    const toInsert = [];

    for (const g of newGuests) {
      const existing = existingMap.get(g.phone);
      if (existing) {
        if (existing.name !== g.name) {
          toUpdate.push({ id: existing.id, name: g.name });
        }
      } else {
        toInsert.push(g);
      }
    }

    // Update names
    for (const u of toUpdate) {
      await Guest.update({ name: u.name }, { where: { id: u.id } });
    }

    // Insert new guests
    if (toInsert.length > 0) {
      await Guest.bulkCreate(toInsert);
    }

    await event.update({ status: "step2_completed" });

    res.status(200).json({
      message: "Guests merged successfully",
      added: toInsert.length,
      updated: toUpdate.length,
      duplicateCount: duplicateLogs.length,
      duplicates: duplicateLogs,
      totalGuests: existingGuests.length + toInsert.length,
    });
  } catch (err) {
    console.error("Step 2 Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// ====================== STEP 3 ======================
const updateEventSettings = async (req, res) => {
  try {
    const {
      eventId,
      smsService,
      whatsappService,
      aiCallService,
      humanCallService,
      automaticSending,
      automaticPause,
      smsRounds = 1,
      smsExecutionDays = 0,
      whatsappRounds = 1,
      whatsappExecutionDays = 0,
      aiCallRounds = 1,
      aiCallExecutionDays = 0,
      humanCallRounds = 1,
      humanCallExecutionDays = 0,
    } = req.body;

    // ✅ Check event
    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const toStartOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const diffInDays = (from, to) => {
      const msPerDay = 1000 * 60 * 60 * 24;
      return Math.floor((toStartOfDay(to) - toStartOfDay(from)) / msPerDay);
    };

    const today = toStartOfDay(new Date());
    const eventDateObj = toStartOfDay(event.eventDate);
    const endDateObj = event.endDate
      ? toStartOfDay(event.endDate)
      : eventDateObj;

    // Use the automation end date if it exists
    const lastAutomationDay = endDateObj;

    // const eventDate = new Date(event.eventDate);
    // const today = new Date();

    // const totalDaysAvailable = Math.floor(
    //   (eventDate - today) / (1000 * 60 * 60 * 24)
    // );
    // console.log(totalDaysAvailable, "mmmmmmmr");

    const totalDaysAvailable = diffInDays(today, lastAutomationDay);

    // if (totalDaysAvailable < 6) {
    //   return res.status(400).json({
    //     error:
    //       "Event date must be at least 6 days after today to schedule automations.",
    //   });
    // }

    // ✅ Define automation priorities
    const automations = [
      smsService && {
        type: "SMS",
        executionDays: smsExecutionDays,
        rounds: smsRounds,
        priority: 1,
      },
      whatsappService && {
        type: "WhatsApp",
        executionDays: whatsappExecutionDays,
        rounds: whatsappRounds,
        priority: 2,
      },
      aiCallService && {
        type: "AI Call",
        executionDays: aiCallExecutionDays,
        rounds: aiCallRounds,
        priority: 3,
      },
      humanCallService && {
        type: "Human Call",
        executionDays: humanCallExecutionDays,
        rounds: humanCallRounds,
        priority: 4,
      },
    ].filter(Boolean);

    // ✅ Check each automation fits in available days
    for (const auto of automations) {
      const requiredDays = auto.executionDays + (auto.rounds - 1);
      if (requiredDays > totalDaysAvailable) {
        return res.status(400).json({
          error: `Not enough days to execute ${auto.type} automation — reduce execution days or rounds. Only ${totalDaysAvailable} days available before event.`,
        });
      }
    }

    // ✅ Enforce correct priority order
    // Loop through automations by priority (SMS=1 → Human Call=4)
    automations.sort((a, b) => a.priority - b.priority);

    for (let i = 0; i < automations.length; i++) {
      const current = automations[i];
      for (let j = i + 1; j < automations.length; j++) {
        const next = automations[j];

        // Next automation cannot start before current
        if (next.executionDays < current.executionDays) {
          return res.status(400).json({
            error: `${next.type} cannot execute before ${current.type}. Follow order: SMS → WhatsApp → AI Call → Human Call.`,
          });
        }
      }
    }

    // ✅ Save or update settings
    const [settings, created] = await EventSetting.findOrCreate({
      where: { eventId },
      defaults: {
        smsService,
        whatsappService,
        aiCallService,
        humanCallService,
        automaticSending,
        automaticPause,
        smsRounds,
        smsExecutionDays,
        whatsappRounds,
        whatsappExecutionDays,
        aiCallRounds,
        aiCallExecutionDays,
        humanCallRounds,
        humanCallExecutionDays,
      },
    });

    if (!created) {
      await settings.update({
        smsService,
        whatsappService,
        aiCallService,
        humanCallService,
        automaticSending,
        automaticPause,
        smsRounds,
        smsExecutionDays,
        whatsappRounds,
        whatsappExecutionDays,
        aiCallRounds,
        aiCallExecutionDays,
        humanCallRounds,
        humanCallExecutionDays,
      });
    }

    // ✅ Mark step as completed
    await event.update({ status: "step3_completed" });

    res.status(200).json({
      message: created
        ? "Event settings created successfully"
        : "Event settings updated successfully",
      settings,
    });
  } catch (err) {
    console.error("Step 3 Error:", err);
    res.status(400).json({ error: err.message || "Server error" });
  }
};

const saveMessageTemplate = async (req, res) => {
  try {
    const { eventId, messageBody } = req.body;

    if (!eventId || !messageBody)
      return res.status(400).json({ error: "Missing required fields" });

    const existing = await MessageTemplate.findOne({ where: { eventId } });

    if (existing) {
      await existing.update({ messageBody });
    } else {
      await MessageTemplate.create({ eventId, messageBody });
    }

    await Event.update(
      { status: "step4_completed" },
      { where: { id: eventId } }
    );

    res.status(200).json({ message: "Message template saved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const saveEventSchedule = async (req, res) => {
  try {
    const { eventId, startDateTime } = req.body;

    // ✅ Validate required fields
    if (!eventId || !startDateTime) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const settings = await EventSetting.findOne({ where: { eventId } });
    if (!settings) {
      return res.status(400).json({
        error: "Please complete automation settings before scheduling.",
      });
    }

    // 🔹 Helpers: work in calendar days (ignore time) for all rules
    const toStartOfDay = (date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const diffInDays = (from, to) => {
      const msPerDay = 1000 * 60 * 60 * 24;
      return Math.floor((toStartOfDay(to) - toStartOfDay(from)) / msPerDay);
    };

    // 🔹 Full objects (with time)
    const eventDateTime = new Date(event.eventDate);
    const startDateTimeObj = new Date(startDateTime);

    // 🔹 Date-only versions for validation
    const eventDateDay = toStartOfDay(eventDateTime);
    const startDateDay = toStartOfDay(startDateTimeObj);

    // 🔹 Decide what is the "last automation day":
    //     prefer endDate (automation end), fall back to eventDate
    const endDateDay = event.endDate
      ? toStartOfDay(event.endDate)
      : eventDateDay;

    // start must be strictly before the event date (business rule)
    if (startDateDay >= eventDateDay) {
      return res.status(400).json({
        error: "Automation start date must be before the event date.",
      });
    }

    // Also make sure start is not after the automation end date
    if (startDateDay > endDateDay) {
      return res.status(400).json({
        error:
          "Automation start date must be on or before the automation end date.",
      });
    }

    // ✅ Calculate total required days based on all automations
    const automations = [
      settings.smsService && {
        type: "SMS",
        days: settings.smsExecutionDays + (settings.smsRounds - 1),
      },
      settings.whatsappService && {
        type: "WhatsApp",
        days: settings.whatsappExecutionDays + (settings.whatsappRounds - 1),
      },
      settings.aiCallService && {
        type: "AI Call",
        days: settings.aiCallExecutionDays + (settings.aiCallRounds - 1),
      },
      settings.humanCallService && {
        type: "Human Call",
        days: settings.humanCallExecutionDays + (settings.humanCallRounds - 1),
      },
    ].filter(Boolean);

    const maxRequiredDays = Math.max(...automations.map((a) => a.days), 0);

    // 🔹 Days available for automations:
    // from startDateDay (inclusive) until endDateDay (exclusive of event day)
    const diffDays = diffInDays(startDateDay, endDateDay);

    if (diffDays < maxRequiredDays) {
      return res.status(400).json({
        error: `Not enough days to execute automation — increase start date or reduce automation days.`,
      });
    }

    // ✅ Check if schedule already exists for this event
    const existing = await EventAutomationSchedule.findOne({
      where: { eventId },
    });

    if (existing) {
      // ✅ Update existing schedule
      await existing.update({ startDateTime: startDateTimeObj });
    } else {
      // ✅ Create new schedule
      await EventAutomationSchedule.create({
        eventId,
        startDateTime: startDateTimeObj,
      });
    }

    // ✅ Update event progress status
    await Event.update(
      { status: "step5_completed" },
      { where: { id: eventId } }
    );

    res.status(200).json({ message: "Event schedule saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getEventDetails = async (req, res) => {
  try {
    const userId = req.user.id; // from middleware
    const { eventId } = req.params; // or req.query if you prefer

    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required" });
    }

    // 🔍 Fetch main event (and verify it belongs to the user)
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // 🔹 Fetch related data
    const [guests, settings, messageTemplate, schedule, payment] =
      await Promise.all([
        Guest.findAll({ where: { eventId } }),
        EventSetting.findOne({ where: { eventId } }),
        MessageTemplate.findOne({ where: { eventId } }),
        EventAutomationSchedule.findOne({ where: { eventId } }),
        Payment.findOne({ where: { eventId } }),
      ]);

    // ✅ Combine all data
    const response = {
      event,
      guests,
      settings,
      messageTemplate,
      schedule,
      payment,
    };

    res.status(200).json({
      message: "Event details fetched successfully",
      data: response,
    });
  } catch (err) {
    console.error("Get Event Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
const getUserEvents = async (req, res) => {
  try {
    const userId = req.user.id; // Logged-in user

    const events = await Event.findAll({
      where: { userId },
      attributes: ["id", "name"], // Return only eventId & eventName
      order: [["createdAt", "DESC"]], // latest first (optional)
    });

    return res.status(200).json({
      message: "Event list fetched successfully",
      events,
    });
  } catch (error) {
    console.error("Get Events Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createOrUpdateEvent,
  addOrUpdateGuests,
  updateEventSettings,
  saveMessageTemplate,
  saveEventSchedule,
  getEventDetails,
  getUserEvents,
};

// const Event = require("../models/event.model");
// const { Op } = require("sequelize");
// const Guest = require("../models/guest.model");
// const xlsx = require("xlsx");

// const createEvent = async (req, res) => {
//   try {
//     const {
//       name,
//       typeId,
//       eventDate,
//       location,
//       estimatedGuests,
//       description,
//       guestList,
//     } = req.body;

//     const userId = req.user.id; // from JWT middleware if added

//     if (!name || !typeId || !eventDate || !location)
//       return res.status(400).json({ error: "Required fields are missing" });

//     // 📅 Calculate default endDate = 3 days before eventDate
//     const eventDateObj = new Date(eventDate);
//     const minEndDate = new Date(eventDateObj);
//     minEndDate.setDate(minEndDate.getDate() - 3);

//     let endDate = req.body.endDate ? new Date(req.body.endDate) : minEndDate;

//     // 🚫 Ensure user doesn’t set endDate closer than 3 days
//     if (endDate < minEndDate) {
//       return res.status(400).json({
//         error: "End date must be at least 3 days before event date",
//       });
//     }

//     const invitationFile = req.file ? req.file.filename : null;

//     const guestListFile = req.files?.guestListFile
//       ? req.files.guestListFile[0].path
//       : null;

//     const event = await Event.create({
//       name,
//       typeId,
//       eventDate,
//       endDate,
//       location,
//       estimatedGuests,
//       description,
//       invitationFile,
//       userId,
//     });
//     let guests = [];
//     let errors = [];

//     // ✅ CASE 1: Excel Upload (No headers, strict validation)
//     if (guestListFile) {
//       const workbook = xlsx.readFile(guestListFile);
//       const sheet = workbook.Sheets[workbook.SheetNames[0]];
//       const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // array of arrays

//       rows.forEach((row, index) => {
//         const name = row[0] ? String(row[0]).trim() : null;
//         const phone = row[1] ? String(row[1]).trim() : null;

//         if (!name || !phone) {
//           errors.push(`Row ${index + 1}: missing ${!name ? "name" : "phone"}`);
//         } else {
//           guests.push({ name, phone, eventId: event.id });
//         }
//       });
//     }

//     // ✅ CASE 2: Manual Guest Entry (Strict Format)
//     if (guestList) {
//       const text = guestList.trim();
//       const entries = text.split(/\s(?=[A-Za-z]+\s*[-–—]\s*\d)/g) || []; // splits by pattern

//       // Fallback if not detected properly
//       const lines =
//         entries.length > 0
//           ? entries
//           : text.split(/\n+/).filter((l) => l.trim());

//       lines.forEach((line, index) => {
//         // Format: "Ali - 0999999999"
//         const match = line.match(/^(.+?)\s*[-–—]\s*(\+?\d{6,})$/);

//         if (!match) {
//           errors.push(`Line ${index + 1}: invalid format → "${line.trim()}"`);
//         } else {
//           const [, name, phone] = match;
//           guests.push({
//             name: name.trim(),
//             phone: phone.trim(),
//             eventId: event.id,
//           });
//         }
//       });
//     }

//     // ❌ Validation failed → return detailed errors
//     if (errors.length > 0) {
//       return res.status(400).json({
//         error: "Invalid guest data",
//         details: errors,
//       });
//     }

//     // 🗃️ Save all guests
//     if (guests.length > 0) {
//       await Guest.bulkCreate(guests);
//     }

//     return res.status(201).json({
//       message: "Event created successfully",
//       event,
//     });
//   } catch (error) {
//     console.error("Create Event Error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };

// // 🧠 Get all events for logged-in user
// const getUserEvents = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const events = await Event.findAll({
//       where: { userId },
//       order: [["createdAt", "DESC"]],
//     });

//     res.status(200).json(events);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// module.exports = { createEvent, getUserEvents };
