const { Op } = require("sequelize");
const axios = require("axios");
const crypto = require("crypto");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const EventSetting = require("../models/eventSetting.model");
const MessageTemplate = require("../models/messageTemplate.model");
const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
const Payment = require("../models/payment.model");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const {
  createAutomations,
  createAutomationsForSteps,
} = require("../services/automationScheduler2");

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
      location,
      locationName,
      locationLat,
      locationLng,
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
    // let endDateObj = endDate ? toStartOfDay(endDate) : null;

    // Event must be at least 6 days after today (calendar days)
    const daysFromTodayToEvent = diffInDays(today, eventDateObj);

    if (daysFromTodayToEvent < 3) {
      return res
        .status(400)
        .json({ error: "Event date must be at least 3 days after today" });
    }

    // Default end date = exactly 3 days before event date if not provided
    // if (!endDateObj) {
    //   endDateObj = new Date(eventDateObj);
    //   endDateObj.setDate(endDateObj.getDate() - 3);
    // }

    // const daysFromTodayToEnd = diffInDays(today, endDateObj);

    // if (daysFromTodayToEnd < 3) {
    //   return res.status(400).json({
    //     error: "End date must be at least 3 days after today",
    //   });
    // }

    // End date must be before event date
    // if (endDateObj >= eventDateObj) {
    //   return res
    //     .status(400)
    //     .json({ error: "End date cannot be on or after the event date" });
    // }

    // End date must be at least 3 full days before event date
    // const daysFromEndToEvent = diffInDays(endDateObj, eventDateObj);

    // if (daysFromEndToEvent < 3) {
    //   return res.status(400).json({
    //     error: "End date must be at least 3 days before event date",
    //   });
    // }
    // if (endDateObj >= eventDateObj) {
    //   return res
    //     .status(400)
    //     .json({ error: "End date cannot be on or after the event date" });
    // }

    const invitationFile = req.file ? req.file.filename : null;
    let event;

    if (eventId) {
      event = await Event.findByPk(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      await event.update({
        name,
        typeId,
        eventDate: eventDateTime,
        location,
        locationName: locationName || event.locationName,
        locationLat: locationLat ?? event.locationLat,
        locationLng: locationLng ?? event.locationLng,
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
        location,
        locationName,
        locationLat,
        locationLng,
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

        if (!name) {
          errors.push(`Row ${index + 1}: Missing name`);
          return;
        }

        let normalized = null;
        if (phoneRaw) {
          normalized = normalizePhone(phoneRaw);
          if (!normalized) {
            errors.push(`Row ${index + 1}: Invalid phone → ${phoneRaw}`);
            return;
          }

          if (duplicates.has(normalized)) {
            duplicateLogs.push(`Row ${index + 1}: Duplicate phone → ${phoneRaw}`);
            return;
          }
          duplicates.add(normalized);
        }

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

        let nameTrimmed = "";
        let phoneTrimmed = "";
        let normalized = null;

        // Check if line contains a dash separator
        const separatorMatch = cleanLine.match(/\s*[-–—]\s*/);
        if (separatorMatch) {
          const parts = cleanLine.split(/\s*[-–—]\s*/);
          nameTrimmed = parts[0].trim();
          phoneTrimmed = parts[1].trim().replace(/[^\d+]/g, "");

          if (phoneTrimmed) {
            normalized = normalizePhone(phoneTrimmed);
            if (!normalized) {
              errors.push(`Line ${index + 1}: Invalid phone → ${phoneTrimmed}`);
              return;
            }
            if (duplicates.has(normalized)) {
              duplicateLogs.push(`Line ${index + 1}: Duplicate phone → ${phoneTrimmed}`);
              return;
            }
            duplicates.add(normalized);
          }
        } else {
          // Whole line is interpreted as a name
          nameTrimmed = cleanLine;
        }

        if (!nameTrimmed) {
          errors.push(`Line ${index + 1}: Missing name → "${line}"`);
          return;
        }

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

    const existingMapByPhone = new Map();
    const existingMapByNameNoPhone = new Map();

    for (const g of existingGuests) {
      if (g.phone) {
        existingMapByPhone.set(g.phone, g);
      } else {
        existingMapByNameNoPhone.set(g.name, g);
      }
    }

    const toUpdate = [];
    const toInsert = [];

    for (const g of newGuests) {
      let existing = null;
      if (g.phone) {
        existing = existingMapByPhone.get(g.phone);
      } else {
        existing = existingMapByNameNoPhone.get(g.name);
      }

      if (existing) {
        if (existing.name !== g.name || existing.phone !== g.phone) {
          toUpdate.push({ id: existing.id, name: g.name, phone: g.phone });
        }
      } else {
        toInsert.push(g);
      }
    }

    // Update names and phones
    for (const u of toUpdate) {
      await Guest.update({ name: u.name, phone: u.phone }, { where: { id: u.id } });
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
    const { eventId, steps = [] } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // ✅ ensure event exists
    const event = await Event.findByPk(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    // optional: normalize baseType if your frontend sends "whatsapp" instead of "whatsapp1"
    const normalizeBaseType = (baseType) => {
      if (!baseType) return null;
      // if your frontend uses "whatsapp", remove this mapping
      if (baseType === "whatsapp") return "whatsapp";
      return baseType;
    };

    // ✅ delete old steps for this event
    await EventSetting.destroy({ where: { eventId } });

    // ✅ prepare new rows
    const stepRows = steps
      .filter((s) => s.runDate && s.baseType) // ignore incomplete ones
      .map((s) => ({
        eventId,
        baseType: normalizeBaseType(s.baseType),
        executionDate: s.runDate, // "YYYY-MM-DD"
        stepOrder: s.order ?? 1,
        rounds: s.rounds || 1,
        name: s.name || null,
      }));

    if (stepRows.length === 0) {
      return res.status(400).json({
        error: "No valid automation steps provided",
      });
    }

    // ✅ bulk insert all steps
    await EventSetting.bulkCreate(stepRows);

    // optional: mark wizard step as completed
    await event.update({ status: "step3_completed" });

    return res.status(200).json({
      message: "Automation steps saved successfully",
      stepsSaved: stepRows.length,
    });
  } catch (err) {
    console.error("EventSetting error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error while saving steps" });
  }
};
// const updateEventSettings = async (req, res) => {
//   try {
//     const {
//       eventId,
//       smsService,
//       whatsappService,
//       aiCallService,
//       humanCallService,
//       automaticSending,
//       automaticPause,
//       smsRounds = 1,
//       smsExecutionDays = 0,
//       whatsappRounds = 1,
//       whatsappExecutionDays = 0,
//       aiCallRounds = 1,
//       aiCallExecutionDays = 0,
//       humanCallRounds = 1,
//       humanCallExecutionDays = 0,
//     } = req.body;

//     // ✅ Check event
//     const event = await Event.findByPk(eventId);
//     if (!event) return res.status(404).json({ error: "Event not found" });

//     const toStartOfDay = (date) => {
//       const d = new Date(date);
//       d.setHours(0, 0, 0, 0);
//       return d;
//     };

//     const diffInDays = (from, to) => {
//       const msPerDay = 1000 * 60 * 60 * 24;
//       return Math.floor((toStartOfDay(to) - toStartOfDay(from)) / msPerDay);
//     };

//     const today = toStartOfDay(new Date());
//     const eventDateObj = toStartOfDay(event.eventDate);
//     const endDateObj = event.endDate
//       ? toStartOfDay(event.endDate)
//       : eventDateObj;

//     // Use the automation end date if it exists
//     const lastAutomationDay = endDateObj;

//     // const eventDate = new Date(event.eventDate);
//     // const today = new Date();

//     // const totalDaysAvailable = Math.floor(
//     //   (eventDate - today) / (1000 * 60 * 60 * 24)
//     // );
//     // console.log(totalDaysAvailable, "mmmmmmmr");

//     const totalDaysAvailable = diffInDays(today, lastAutomationDay);

//     // if (totalDaysAvailable < 6) {
//     //   return res.status(400).json({
//     //     error:
//     //       "Event date must be at least 6 days after today to schedule automations.",
//     //   });
//     // }

//     // ✅ Define automation priorities
//     const automations = [
//       smsService && {
//         type: "SMS",
//         executionDays: smsExecutionDays,
//         rounds: smsRounds,
//         priority: 1,
//       },
//       whatsappService && {
//         type: "WhatsApp",
//         executionDays: whatsappExecutionDays,
//         rounds: whatsappRounds,
//         priority: 2,
//       },
//       aiCallService && {
//         type: "AI Call",
//         executionDays: aiCallExecutionDays,
//         rounds: aiCallRounds,
//         priority: 3,
//       },
//       humanCallService && {
//         type: "Human Call",
//         executionDays: humanCallExecutionDays,
//         rounds: humanCallRounds,
//         priority: 4,
//       },
//     ].filter(Boolean);

//     // ✅ Check each automation fits in available days
//     for (const auto of automations) {
//       const requiredDays = auto.executionDays + (auto.rounds - 1);
//       if (requiredDays > totalDaysAvailable) {
//         return res.status(400).json({
//           error: `Not enough days to execute ${auto.type} automation — reduce execution days or rounds. Only ${totalDaysAvailable} days available before event.`,
//         });
//       }
//     }

//     // ✅ Enforce correct priority order
//     // Loop through automations by priority (SMS=1 → Human Call=4)
//     automations.sort((a, b) => a.priority - b.priority);

//     for (let i = 0; i < automations.length; i++) {
//       const current = automations[i];
//       for (let j = i + 1; j < automations.length; j++) {
//         const next = automations[j];

//         // Next automation cannot start before current
//         if (next.executionDays < current.executionDays) {
//           return res.status(400).json({
//             error: `${next.type} cannot execute before ${current.type}. Follow order: SMS → WhatsApp → AI Call → Human Call.`,
//           });
//         }
//       }
//     }

//     // ✅ Save or update settings
//     const [settings, created] = await EventSetting.findOrCreate({
//       where: { eventId },
//       defaults: {
//         smsService,
//         whatsappService,
//         aiCallService,
//         humanCallService,
//         automaticSending,
//         automaticPause,
//         smsRounds,
//         smsExecutionDays,
//         whatsappRounds,
//         whatsappExecutionDays,
//         aiCallRounds,
//         aiCallExecutionDays,
//         humanCallRounds,
//         humanCallExecutionDays,
//       },
//     });

//     if (!created) {
//       await settings.update({
//         smsService,
//         whatsappService,
//         aiCallService,
//         humanCallService,
//         automaticSending,
//         automaticPause,
//         smsRounds,
//         smsExecutionDays,
//         whatsappRounds,
//         whatsappExecutionDays,
//         aiCallRounds,
//         aiCallExecutionDays,
//         humanCallRounds,
//         humanCallExecutionDays,
//       });
//     }

//     // ✅ Mark step as completed
//     await event.update({ status: "step3_completed" });

//     res.status(200).json({
//       message: created
//         ? "Event settings created successfully"
//         : "Event settings updated successfully",
//       settings,
//     });
//   } catch (err) {
//     console.error("Step 3 Error:", err);
//     res.status(400).json({ error: err.message || "Server error" });
//   }
// };

// const updateAutomationSettings = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { eventId, steps = [] } = req.body;

//     if (!eventId) {
//       return res.status(400).json({ error: "eventId is required" });
//     }

//     // ensure event belongs to this user
//     const event = await Event.findOne({
//       where: { id: eventId, userId },
//     });
//     if (!event) {
//       return res.status(404).json({ error: "Event not found or unauthorized" });
//     }

//     const now = new Date();
//     const todayKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

//     // ✅ validate: user can only send future steps (runDate > today)
//     const invalid = steps.filter(
//       (s) => !s.runDate || s.runDate < todayKey || !s.baseType
//     );
//     if (invalid.length > 0) {
//       return res.status(400).json({
//         error:
//           "You can edit or delete only future automations (after today). Past or in-progress automations cannot be modified.",
//       });
//     }

//     // ✅ remove only FUTURE EventSetting rows for this event
//     await EventSetting.destroy({
//       where: {
//         eventId,
//         executionDate: { [Op.gt]: todayKey },
//       },
//     });

//     // ✅ insert the new FUTURE steps
//     const normalizeBaseType = (baseType) => {
//       if (!baseType) return null;
//       return baseType; // already "sms" | "whatsapp" | "ai_call" | "human_call"
//     };

//     const stepRows = steps.map((s) => ({
//       eventId,
//       baseType: normalizeBaseType(s.baseType),
//       executionDate: s.runDate, // "YYYY-MM-DD"
//       stepOrder: s.order ?? 1,
//       rounds: s.rounds || 1,
//       name: s.name || null,
//     }));

//     if (stepRows.length === 0) {
//       // if user deleted all future steps, that's allowed → no more future automations
//       // but we still need to clear future tasks
//       console.log(`All future automations removed for event ${eventId}`);
//     } else {
//       await EventSetting.bulkCreate(stepRows);
//     }

//     // ✅ delete FUTURE pending automation tasks & let queue no-op on old jobs
//     const todayStart = new Date(todayKey);
//     todayStart.setHours(0, 0, 0, 0);

//     const tomorrowStart = new Date(todayStart);
//     tomorrowStart.setDate(tomorrowStart.getDate() + 1);

//     // We consider "future" tasks as those scheduled from tomorrow onward.
//     const futureWhere = {
//       eventId,
//       status: "pending",
//       scheduledAt: { [Op.gte]: tomorrowStart },
//     };

//     await Promise.all([
//       SMSAutomation.destroy({ where: futureWhere }),
//       WhatsAppAutomation.destroy({ where: futureWhere }),
//       AICallAutomation.destroy({ where: futureWhere }),
//       HumanCallAutomation.destroy({ where: futureWhere }),
//     ]);

//     // ✅ regenerate tasks only for FUTURE steps
//     // (createAutomations will only schedule future ones; see next section)
//     const guests = await Guest.findAll({ where: { eventId } });
//     const template = await MessageTemplate.findOne({ where: { eventId } });

//     const templates = {
//       smsTemplateId: template?.id || null,
//       whatsappTemplateId: template?.id || null,
//       aiCallTemplateId: template?.id || null,
//       humanCallTemplateId: template?.id || null,
//     };

//     await createAutomations(event, guests, templates);

//     // optional: keep step3_completed
//     await event.update({ status: "step3_completed" });

//     return res.status(200).json({
//       message: "Future automation steps updated successfully",
//       stepsSaved: stepRows.length,
//     });
//   } catch (err) {
//     console.error("updateAutomationSettings error:", err);
//     return res
//       .status(500)
//       .json({ error: err.message || "Server error while saving steps" });
//   }
// };

const updateAutomationSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId, steps = [] } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // ensure event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // ❌ reject past steps (runDate < today)
    const invalidPast = steps.filter(
      (s) => !s.runDate || s.runDate < todayKey || !s.baseType
    );
    if (invalidPast.length > 0) {
      return res.status(400).json({
        error:
          "You can only configure automations for today or future dates. Past automations cannot be modified.",
      });
    }

    // split incoming steps into: todaySteps (new ones) & futureSteps (fully editable)
    const todaySteps = steps.filter((s) => s.runDate === todayKey);
    const futureSteps = steps.filter((s) => s.runDate > todayKey);

    const normalizeBaseType = (baseType) => {
      if (!baseType) return null;
      return baseType; // "sms" | "whatsapp" | "ai_call" | "human_call"
    };

    // ✅ 1) HANDLE FUTURE STEPS: overwrite completely
    await EventSetting.destroy({
      where: {
        eventId,
        executionDate: { [Op.gt]: todayKey },
      },
    });

    const futureRows =
      futureSteps.length > 0
        ? futureSteps.map((s) => ({
          eventId,
          baseType: normalizeBaseType(s.baseType),
          executionDate: s.runDate,
          stepOrder: s.order ?? 1,
          rounds: s.rounds || 1,
          name: s.name || null,
        }))
        : [];

    if (futureRows.length > 0) {
      await EventSetting.bulkCreate(futureRows);
    } else {
      console.log(`All future automations removed for event ${eventId}`);
    }

    // ✅ 2) HANDLE TODAY STEPS: append only (no deletion of existing)
    const todayRows =
      todaySteps.length > 0
        ? await Promise.all(
          todaySteps.map((s) =>
            EventSetting.create({
              eventId,
              baseType: normalizeBaseType(s.baseType),
              executionDate: s.runDate, // todayKey
              stepOrder: s.order ?? 1,
              rounds: s.rounds || 1,
              name: s.name || null,
            })
          )
        )
        : [];

    // ✅ 3) delete FUTURE pending automation tasks, keep today's tasks as-is
    const todayStart = new Date(todayKey);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const futureWhere = {
      eventId,
      status: "pending",
      scheduledAt: { [Op.gte]: tomorrowStart }, // >= tomorrow 00:00
    };

    await Promise.all([
      SMSAutomation.destroy({ where: futureWhere }),
      WhatsAppAutomation.destroy({ where: futureWhere }),
      AICallAutomation.destroy({ where: futureWhere }),
      HumanCallAutomation.destroy({ where: futureWhere }),
    ]);

    // ✅ 4) regenerate tasks only for FUTURE steps (createAutomations now only uses > today)
    const guests = await Guest.findAll({ where: { eventId } });
    const template = await MessageTemplate.findOne({ where: { eventId } });

    const templates = {
      smsTemplateId: template?.id || null,
      whatsappTemplateId: template?.id || null,
      aiCallTemplateId: template?.id || null,
      humanCallTemplateId: template?.id || null,
    };

    await createAutomations(event, guests, templates); // → only future

    // ✅ 5) create tasks for TODAY's *new* steps only (no duplication)
    if (todayRows.length > 0) {
      // todayRows are the EventSetting instances we just created for today
      await createAutomationsForSteps(event, guests, templates, todayRows);
    }

    await event.update({ status: "step3_completed" });

    return res.status(200).json({
      message: "Automation steps updated successfully",
      stepsSaved: futureRows.length + todayRows.length,
    });
  } catch (err) {
    console.error("updateAutomationSettings error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error while saving steps" });
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
// const saveEventSchedule = async (req, res) => {
//   try {
//     const { eventId, startDateTime } = req.body;

//     // ✅ Validate required fields
//     if (!eventId || !startDateTime) {
//       return res.status(400).json({ error: "Missing required fields" });
//     }

//     const event = await Event.findByPk(eventId);
//     if (!event) return res.status(404).json({ error: "Event not found" });

//     const settings = await EventSetting.findOne({ where: { eventId } });
//     if (!settings) {
//       return res.status(400).json({
//         error: "Please complete automation settings before scheduling.",
//       });
//     }

//     // 🔹 Helpers: work in calendar days (ignore time) for all rules
//     const toStartOfDay = (date) => {
//       const d = new Date(date);
//       d.setHours(0, 0, 0, 0);
//       return d;
//     };

//     const diffInDays = (from, to) => {
//       const msPerDay = 1000 * 60 * 60 * 24;
//       return Math.floor((toStartOfDay(to) - toStartOfDay(from)) / msPerDay);
//     };

//     // 🔹 Full objects (with time)
//     const eventDateTime = new Date(event.eventDate);
//     const startDateTimeObj = new Date(startDateTime);

//     // 🔹 Date-only versions for validation
//     const eventDateDay = toStartOfDay(eventDateTime);
//     const startDateDay = toStartOfDay(startDateTimeObj);

//     // 🔹 Decide what is the "last automation day":
//     //     prefer endDate (automation end), fall back to eventDate
//     const endDateDay = event.endDate
//       ? toStartOfDay(event.endDate)
//       : eventDateDay;

//     // start must be strictly before the event date (business rule)
//     if (startDateDay >= eventDateDay) {
//       return res.status(400).json({
//         error: "Automation start date must be before the event date.",
//       });
//     }

//     // Also make sure start is not after the automation end date
//     if (startDateDay > endDateDay) {
//       return res.status(400).json({
//         error:
//           "Automation start date must be on or before the automation end date.",
//       });
//     }

//     // ✅ Calculate total required days based on all automations
//     const automations = [
//       settings.smsService && {
//         type: "SMS",
//         days: settings.smsExecutionDays + (settings.smsRounds - 1),
//       },
//       settings.whatsappService && {
//         type: "WhatsApp",
//         days: settings.whatsappExecutionDays + (settings.whatsappRounds - 1),
//       },
//       settings.aiCallService && {
//         type: "AI Call",
//         days: settings.aiCallExecutionDays + (settings.aiCallRounds - 1),
//       },
//       settings.humanCallService && {
//         type: "Human Call",
//         days: settings.humanCallExecutionDays + (settings.humanCallRounds - 1),
//       },
//     ].filter(Boolean);

//     const maxRequiredDays = Math.max(...automations.map((a) => a.days), 0);

//     // 🔹 Days available for automations:
//     // from startDateDay (inclusive) until endDateDay (exclusive of event day)
//     const diffDays = diffInDays(startDateDay, endDateDay);

//     if (diffDays < maxRequiredDays) {
//       return res.status(400).json({
//         error: `Not enough days to execute automation — increase start date or reduce automation days.`,
//       });
//     }

//     // ✅ Check if schedule already exists for this event
//     const existing = await EventAutomationSchedule.findOne({
//       where: { eventId },
//     });

//     if (existing) {
//       // ✅ Update existing schedule
//       await existing.update({ startDateTime: startDateTimeObj });
//     } else {
//       // ✅ Create new schedule
//       await EventAutomationSchedule.create({
//         eventId,
//         startDateTime: startDateTimeObj,
//       });
//     }

//     // ✅ Update event progress status
//     await Event.update(
//       { status: "step5_completed" },
//       { where: { id: eventId } }
//     );

//     res.status(200).json({ message: "Event schedule saved successfully" });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// };

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
// ====================== EVENT STATS (AUTOMATION COUNTS & COSTS) ======================
const getEventAutomationStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // Verify event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // Count how many were actually sent (status = success)
    const [
      smsSent,
      whatsappSent,
      aiCallSent,
      humanCallSent,
      smsAmount,
      whatsappAmount,
      aiCallAmount,
      humanCallAmount,
      setupFeeAmount,
    ] = await Promise.all([
      SMSAutomation.count({
        where: { eventId, status: "success", isTriggered: true },
      }),
      WhatsAppAutomation.count({
        where: { eventId, status: "success", isTriggered: true },
      }),
      AICallAutomation.count({
        where: { eventId, status: "success", isTriggered: true },
      }),
      HumanCallAutomation.count({
        where: { eventId, status: "success", isTriggered: true },
      }),

      // Sum of actual charges from Payment table
      Payment.sum("amount", {
        where: { eventId, type: "sms_fee", status: "succeeded" },
      }),
      Payment.sum("amount", {
        where: { eventId, type: "whatsapp_fee", status: "succeeded" },
      }),
      Payment.sum("amount", {
        where: { eventId, type: "ai_call_fee", status: "succeeded" },
      }),
      Payment.sum("amount", {
        where: { eventId, type: "human_call_fee", status: "succeeded" },
      }),
      // Payment.sum("amount", {
      //   where: { eventId, type: "setup_fee", status: "succeeded" },
      // }),
    ]);

    const safeSum = (v) => (v == null ? 0 : v);

    const smsAmountCents = safeSum(smsAmount);
    const whatsappAmountCents = safeSum(whatsappAmount);
    const aiCallAmountCents = safeSum(aiCallAmount);
    const humanCallAmountCents = safeSum(humanCallAmount);
    // const setupFeeAmountCents = safeSum(setupFeeAmount);

    const automationFeesCents =
      smsAmountCents +
      whatsappAmountCents +
      aiCallAmountCents +
      humanCallAmountCents;

    const grandTotalCents = automationFeesCents;

    return res.status(200).json({
      eventId: Number(eventId),
      currency: "ils",
      perChannel: {
        sms: {
          sent: smsSent,
          amountCents: smsAmountCents,
        },
        whatsapp: {
          sent: whatsappSent,
          amountCents: whatsappAmountCents,
        },
        aiCall: {
          sent: aiCallSent,
          amountCents: aiCallAmountCents,
        },
        humanCall: {
          sent: humanCallSent,
          amountCents: humanCallAmountCents,
        },
      },
      // setupFeeCents: setupFeeAmountCents,
      totals: {
        automationFeesCents,
        grandTotalCents,
      },
    });
  } catch (error) {
    console.error("getEventAutomationStats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// ====================== EVENT CHANNEL RESPONSE RATES ======================
/**
 * For a given event, calculate response rate per channel:
 * - "Reached" = guests who had at least one successful automation of that type
 * - "Responded" = reached guests whose status != "pending"
 * - responseRatePercent = responded / totalGuests * 100  ✅
 *
 * GET /api/event/channel-response/:eventId
 */
const getChannelResponseRates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // Verify event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // Load all guests
    const guests = await Guest.findAll({
      where: { eventId },
      attributes: ["id", "rsvpToken", "status"],
    });

    const totalGuests = guests.length;
    const guestByToken = new Map(
      guests.map((g) => [g.rsvpToken, { id: g.id, status: g.status }])
    );

    // Helper for channel stats
    async function computeChannelStats(model, type) {
      const tasks = await model.findAll({
        where: { eventId, status: "success" },
        attributes: ["rsvpToken"],
      });

      if (!tasks.length || totalGuests === 0) {
        return {
          type,
          reached: 0,
          responded: 0,
          responseRatePercent: 0,
        };
      }

      const tokenSet = new Set(tasks.map((t) => t.rsvpToken));

      let reached = 0;
      let responded = 0;

      for (const token of tokenSet) {
        const guest = guestByToken.get(token);
        if (!guest) continue;

        reached += 1;

        if (guest.status !== "pending") {
          responded += 1;
        }
      }

      const responseRatePercent = Number(
        ((responded / totalGuests) * 100).toFixed(1)
      );

      return {
        type,
        reached,
        responded,
        responseRatePercent,
      };
    }

    const results = await Promise.all([
      computeChannelStats(SMSAutomation, "sms"),
      computeChannelStats(WhatsAppAutomation, "whatsapp"),
      computeChannelStats(AICallAutomation, "ai_call"),
      computeChannelStats(HumanCallAutomation, "human_call"),
    ]);

    return res.status(200).json(results);
  } catch (error) {
    console.error("getChannelResponseRates error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getEventAutomationSteps = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // ensure event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const steps = await EventSetting.findAll({
      where: { eventId },
      order: [
        ["executionDate", "ASC"],
        ["stepOrder", "ASC"],
        ["id", "ASC"],
      ],
    });

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // helper map so we can look up the appropriate automation table by baseType
    const modelMap = {
      sms: SMSAutomation,
      whatsapp: WhatsAppAutomation,
      ai_call: AICallAutomation,
      human_call: HumanCallAutomation,
    };

    // compute a more precise status for each step by examining actual tasks
    const formattedPromises = steps.map(async (s) => {
      const dateKey =
        typeof s.executionDate === "string"
          ? s.executionDate
          : s.executionDate.toISOString().slice(0, 10);

      // default status based only on the calendar
      let status =
        dateKey < todayKey
          ? "completed"
          : dateKey === todayKey
            ? "in_progress"
            : "upcoming";

      // if the step has passed or is today, try to read real task results
      const Model = modelMap[s.baseType];
      if (Model) {
        const start = new Date(dateKey);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const tasks = await Model.findAll({
          where: {
            eventId,
            scheduledAt: { [Op.gte]: start, [Op.lt]: end },
          },
          attributes: ["status"],
        });

        if (tasks.length > 0) {
          const anyPending = tasks.some((t) => t.status === "pending");
          const anySuccess = tasks.some((t) => t.status === "success");
          const allFailed = tasks.every((t) => t.status === "failed");

          if (anySuccess) {
            status = "completed";
          } else if (allFailed && !anyPending) {
            status = "failed";
          } else if (anyPending) {
            // still in progress if there are pending jobs
            status = dateKey === todayKey ? "in_progress" : "upcoming";
          }
        } else {
          // there were no tasks scheduled for this step yet
          if (dateKey > todayKey) {
            status = "upcoming";
          } else if (dateKey === todayKey) {
            status = "in_progress";
          } else {
            // past date with no tasks → treat as failed so UI can show attention
            status = "failed";
          }
        }
      }

      const canEdit = status === "upcoming";
      const canDelete = status === "upcoming";

      return {
        id: s.id,
        baseType: s.baseType, // "sms" | "whatsapp" | "ai_call" | "human_call"
        runDate: dateKey, // what your frontend calls runDate
        order: s.stepOrder,
        rounds: s.rounds,
        name: s.name,
        status, // now "success", "failed", "in_progress" or "upcoming"
        canEdit,
        canDelete,
      };
    });

    const formatted = await Promise.all(formattedPromises);

    return res.status(200).json({
      eventId: Number(eventId),
      steps: formatted,
    });
  } catch (err) {
    console.error("getEventAutomationSteps error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * PATCH /api/event/invitation/:eventId
 * Replaces or removes the invitation file for an existing event.
 * Send multipart/form-data with field `invitationFile` to upload a new file.
 * Send JSON body { remove: true } (no file) to clear the invitation.
 */
const fs = require("fs");
const path = require("path");

const updateInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;
    const remove = req.body?.remove === "true" || req.body?.remove === true;

    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) return res.status(404).json({ error: "Event not found or unauthorized" });

    const oldFile = event.invitationFile;
    const deleteOld = () => {
      if (!oldFile) return;
      const oldPath = path.join(__dirname, "..", "uploads", "invitations", oldFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    };

    if (remove) {
      // Clear invitation
      deleteOld();
      await event.update({ invitationFile: null });
      return res.json({ success: true, invitationFile: null });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Replace old file
    deleteOld();
    await event.update({ invitationFile: req.file.filename });

    return res.json({ success: true, invitationFile: req.file.filename });
  } catch (err) {
    console.error("updateInvitation error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createOrUpdateEvent,
  addOrUpdateGuests,
  updateEventSettings,
  saveMessageTemplate,
  getEventDetails,
  getUserEvents,
  getEventAutomationStats,
  getChannelResponseRates,
  getEventAutomationSteps,
  updateAutomationSettings,
  updateInvitation,
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
