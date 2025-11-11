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

    const eventDateObj = new Date(eventDate); // includes time
    const endDateObj = endDate ? new Date(endDate) : null;
    const now = new Date();

    // Event must be at least 6 days after now
    const minEventDate = new Date(now);
    minEventDate.setDate(minEventDate.getDate() + 6);

    if (eventDateObj < minEventDate) {
      return res
        .status(400)
        .json({ error: "Event date must be at least 6 days after today" });
    }

    // End date must be at least 3 days before event date
    const minEndDate = new Date(eventDateObj);
    minEndDate.setDate(minEndDate.getDate() - 3);

    const finalEndDate = endDateObj || minEndDate;

    if (finalEndDate > eventDateObj) {
      return res
        .status(400)
        .json({ error: "End date cannot be after the event date" });
    }

    if (finalEndDate < minEndDate) {
      return res
        .status(400)
        .json({ error: "End date must be at least 3 days before event date" });
    }

    const invitationFile = req.file ? req.file.filename : null;
    let event;

    if (eventId) {
      event = await Event.findByPk(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      await event.update({
        name,
        typeId,
        eventDate: eventDateObj,
        endDate: finalEndDate,
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
        eventDate: eventDateObj,
        endDate: finalEndDate,
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

    let guests = [];
    let errors = [];

    // Excel Upload
    if (guestListFile) {
      const workbook = xlsx.readFile(guestListFile);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      rows.forEach((row, index) => {
        const name = row[0] ? String(row[0]).trim() : null;
        const phone = row[1] ? String(row[1]).trim() : null;
        if (!name || !phone)
          errors.push(`Row ${index + 1}: Missing ${!name ? "name" : "phone"}`);
        else guests.push({ name, phone, eventId });
      });
    }

    // Manual Entry
    if (guestList) {
      const lines = guestList.split(/\n+/).filter((l) => l.trim());
      lines.forEach((line, index) => {
        const match = line.match(/^(.+?)\s*[-–—]\s*(\+?\d{6,})$/);
        if (!match)
          errors.push(`Line ${index + 1}: Invalid format → "${line}"`);
        else {
          const [, name, phone] = match;
          guests.push({ name: name.trim(), phone: phone.trim(), eventId });
        }
      });
    }

    if (errors.length > 0)
      return res
        .status(400)
        .json({ error: "Invalid guest data", details: errors });

    await Guest.destroy({ where: { eventId } });
    if (guests.length > 0) await Guest.bulkCreate(guests);

    await event.update({ status: "step2_completed" });

    res.status(200).json({ message: "Guests saved successfully", guests });
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

    const eventDate = new Date(event.eventDate);
    const today = new Date();

    const totalDaysAvailable = Math.floor(
      (eventDate - today) / (1000 * 60 * 60 * 24)
    );

    if (totalDaysAvailable < 6) {
      return res.status(400).json({
        error:
          "Event date must be at least 6 days after today to schedule automations.",
      });
    }

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
    if (!eventId || !startDateTime)
      return res.status(400).json({ error: "Missing required fields" });
    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    const settings = await EventSetting.findOne({ where: { eventId } });
    if (!settings)
      return res.status(400).json({
        error: "Please complete automation settings before scheduling.",
      });

    const eventDate = new Date(event.eventDate);
    const startDate = new Date(startDateTime);

    if (startDate >= eventDate)
      return res.status(400).json({
        error: "Automation start date must be before the event date.",
      });

    // Calculate total required days based on all automations
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

    const diffDays = Math.floor(
      (eventDate - startDate) / (1000 * 60 * 60 * 24)
    );

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
      await existing.update({ startDateTime });
    } else {
      // ✅ Create new schedule
      await EventAutomationSchedule.create({ eventId, startDateTime });
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

module.exports = {
  createOrUpdateEvent,
  addOrUpdateGuests,
  updateEventSettings,
  saveMessageTemplate,
  saveEventSchedule,
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
