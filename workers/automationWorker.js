// workers/automationWorker.js
const { Worker } = require("bullmq");
const { Op } = require("sequelize");
const cardcomService = require("../services/cardcom.service");
const moment = require("moment-timezone");

const { automationQueue } = require("../queues/automationQueue");
const EventSetting = require("../models/eventSetting.model");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const ReminderAutomation = require("../models/reminderAutomation.model");
const ReminderAutomationSchedule = require("../models/reminderAutomationSchedule.model");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const User = require("../models/user.model");
const Payment = require("../models/payment.model");
const smsService = require("../services/sms.service");
const whatsappService = require("../services/whatsapp.service");
const fs = require("fs");
const path = require("path");
const { enqueueEmailJob } = require("../queues/emailQueue");
const ServicePricing = require("../models/servicePricing.model");

let PRICING_CACHE = null; // { key: { priceAgorot, name, ... } }
let PRICING_LAST_LOADED_AT = 0;

async function loadPricingCache(force = false) {
  const TTL_MS = 10 * 60 * 1000; // 10 minutes

  if (!force && PRICING_CACHE && Date.now() - PRICING_LAST_LOADED_AT < TTL_MS) {
    return PRICING_CACHE;
  }

  const rows = await ServicePricing.findAll();
  const map = {};
  for (const r of rows) {
    map[r.key] = {
      priceAgorot: Number(r.priceAgorot || 0),
      name: r.name,
      description: r.description,
    };
  }

  PRICING_CACHE = map;
  PRICING_LAST_LOADED_AT = Date.now();
  return PRICING_CACHE;
}

// Warm cache on startup (optional but recommended)
loadPricingCache(true).catch((e) =>
  console.error("Failed to warm ServicePricing cache:", e)
);

function getServiceKeyForAutomationType(type) {
  switch (type) {
    case "SMS":
    case "REMINDER_SMS":
      return "sms_fee";

    case "WhatsApp":
    case "REMINDER_WHATSAPP":
      return "whatsapp_fee";

    case "AI_CALL":
      return "ai_call_fee";

    case "HUMAN_CALL":
      return "human_call_fee";

    default:
      return null;
  }
}

async function getPriceForType(type) {
  const pricing = await loadPricingCache(false);
  const key = getServiceKeyForAutomationType(type);
  if (!key) return 0;

  const row = pricing[key];
  return row ? Number(row.priceAgorot || 0) : 0;
}
// ------ helpers shared with previous cron file ------

// const SMS_PRICE = parseInt(process.env.SMS_PRICE_AGOROT || "200", 10);
// const WHATSAPP_PRICE = parseInt(process.env.WHATSAPP_PRICE_AGOROT || "200", 10);
// const AICALL_PRICE = parseInt(process.env.AICALL_PRICE_AGOROT || "250", 10);
// const HUMANCALL_PRICE = parseInt(
//   process.env.HUMANCALL_PRICE_AGOROT || "1500",
//   10
// );

// function getPriceForType(type) {
//   switch (type) {
//     case "SMS":
//       return SMS_PRICE;
//     case "WhatsApp":
//       return WHATSAPP_PRICE;
//     case "AI_CALL":
//       return AICALL_PRICE;
//     case "HUMAN_CALL":
//       return HUMANCALL_PRICE;

//     // reminders reuse same unit price:
//     case "REMINDER_SMS":
//       return SMS_PRICE;
//     case "REMINDER_WHATSAPP":
//       return WHATSAPP_PRICE;
//     default:
//       return 0;
//   }
// }

function mapAutomationTypeToPaymentType(type) {
  switch (type) {
    case "SMS":
      return "sms_fee";
    case "WhatsApp":
      return "whatsapp_fee";
    case "AI_CALL":
      return "ai_call_fee";
    case "HUMAN_CALL":
      return "human_call_fee";
    // reminder flows
    case "REMINDER_SMS":
      return "reminder_sms_fee";
    case "REMINDER_WHATSAPP":
      return "reminder_whatsapp_fee";
    default:
      return "sms_fee";
  }
}

function humanizeAutomationType(type) {
  switch (type) {
    case "SMS":
      return "SMS";
    case "WhatsApp":
      return "WhatsApp";
    case "AI_CALL":
      return "AI Call";
    case "HUMAN_CALL":
      return "Human Call";
    default:
      return type;
  }
}

function getEventTypeKeyForCall(eventTypeName) {
  // Map event type name to plural key for the API call
  if (!eventTypeName) return "events";

  const normalized = eventTypeName.toLowerCase().trim();

  switch (normalized) {
    case "wedding":
      return "weddings";
    case "birthday":
      return "birthdays";
    case "concerts":
      return "concerts";
    case "corporate_event":
      return "corporate_event";
    case "charity_event":
      return "charity_event";
    default:
      // Fallback: pluralize by adding 's'
      return `${normalized}s`;
  }
}

function loadTemplate(fileName) {
  const filePath = path.join(__dirname, "..", "templates", fileName);
  return fs.readFileSync(filePath, "utf8");
}

async function sendAutomationChargeEmail({
  user,
  event,
  type,
  quantity,
  unitPriceAgorot,
  totalAgorot,
  payment,
  dateKey,
}) {
  try {
    if (!user || !user.email) {
      console.warn(
        `Skipping charge email: user or email missing for userId=${user?.id}`
      );
      return;
    }

    const currency = "₪";
    const unitPriceILS = (unitPriceAgorot / 100).toFixed(2);
    const totalILS = (totalAgorot / 100).toFixed(2);
    const automationTypeLabel = humanizeAutomationType(type);

    const paymentDate = payment.createdAt
      ? new Date(payment.createdAt).toLocaleString("he-IL")
      : new Date().toLocaleString("he-IL");

    let emailTemplate = loadTemplate("automationChargeEmail.html");

    emailTemplate = emailTemplate
      .replace(/{{name}}/g, user.name || "")
      .replace(/{{eventName}}/g, event?.name || "")
      .replace(/{{automationType}}/g, automationTypeLabel)
      .replace(/{{quantity}}/g, String(quantity))
      .replace(/{{unitPrice}}/g, unitPriceILS)
      .replace(/{{total}}/g, totalILS)
      .replace(/{{currency}}/g, currency)
      .replace(/{{paymentId}}/g, payment.paymentIntentId || "")
      .replace(/{{paymentDate}}/g, paymentDate)
      .replace(/{{year}}/g, new Date().getFullYear());

    await enqueueEmailJob({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `Automation charge for event "${event?.name || ""
        }" - ${currency}${totalILS} (date: ${dateKey})`,
      html: emailTemplate,
    });

    console.log(
      `Charge email sent to ${user.email} for payment ${payment.paymentIntentId}`
    );
  } catch (err) {
    console.error("Failed to send automation charge email:", err);
  }
}

// ------ BILLING PER DATE ------

function getDateKeyFromDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function getDateRangeForKey(dateKey) {
  const start = new Date(dateKey);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Charge once for ALL unbilled tasks of a given event+type+date.
 * Filters tasks based on guest status to charge only for automations that will actually be sent.
 */
async function chargeAutomationBatchForDate({
  user,
  event,
  type,
  tasksForDate,
  model,
  dateKey,
}) {
  try {
    const pricePerUnit = await getPriceForType(type);
    if (!pricePerUnit) {
      console.warn(`No price configured for type ${type}, skipping billing.`);
      return true;
    }

    if (!user || !user.cardcomToken) {
      console.error(
        `Cannot charge automation batch: missing Cardcom token for user ${user?.id}`
      );
      return false;
    }

    // Determine which tasks will actually be sent based on guest status filters
    const firstAutomationType = await getFirstAutomationTypeForEvent(event.id);
    let tasksToCharge = tasksForDate;

    if (type !== "REMINDER_SMS" && type !== "REMINDER_WHATSAPP") {
      if (type !== firstAutomationType) {
        // Non-first automations: only charge for pending/hesitate guests
        const allowedStatuses = ["pending", "hesitate"];
        tasksToCharge = tasksForDate.filter((task) => {
          const guest = guestByToken.get(task.rsvpToken);
          return guest && allowedStatuses.includes(guest.status);
        });
      }
    }

    const allTaskIds = tasksForDate.map((t) => t.id);

    if (tasksToCharge.length === 0) {
      console.log(`No billable tasks for ${type} on ${dateKey}, skipping charge.`);
      // Mark all in this batch as processed (0) so other workers skip them
      await model.update(
        { billingPaymentId: 0 },
        { where: { id: { [Op.in]: allTaskIds } } }
      );
      return true;
    }

    let amountAgorot = pricePerUnit * tasksToCharge.length;
    if (amountAgorot <= 0) return true;

    // Small sum tax logic (if < 10 ILS)
    let taxAgorot = 0;
    if (amountAgorot < 1000) {
      taxAgorot = 80; // 0.8 ILS
      amountAgorot += taxAgorot;
    }

    const automationPaymentType = mapAutomationTypeToPaymentType(type);

    // Charge using Cardcom
    const result = await cardcomService.chargeToken({
      amount: amountAgorot / 100, // Cardcom takes ILS
      token: user.cardcomToken,
      eventId: event.id,
      description: `${type} automation batch for event #${event.id} on date ${dateKey}`,
    });

    const payment = await Payment.create({
      eventId: event.id,
      amount: amountAgorot,
      currency: "ils",
      paymentIntentId: result.transactionId || "N/A",
      type: automationPaymentType,
      status: result.success ? "succeeded" : "failed",
    });

    if (!result.success) {
      console.error(
        `Automation charge for ${type} event ${event.id} [${dateKey}] failed: ${result.errorDescription}`
      );
      return false;
    }

    await sendAutomationChargeEmail({
      user,
      event,
      type,
      quantity: tasksToCharge.length,
      unitPriceAgorot: pricePerUnit,
      totalAgorot: amountCents,
      payment,
      dateKey,
    });

    // Mark all tasks in this batch
    const billableIds = tasksToCharge.map((t) => t.id);
    const skippedIds = allTaskIds.filter((id) => !billableIds.includes(id));

    if (billableIds.length > 0) {
      await model.update(
        { billingPaymentId: payment.id },
        { where: { id: { [Op.in]: billableIds } } }
      );
    }

    if (skippedIds.length > 0) {
      await model.update(
        { billingPaymentId: 0 }, // 0 means processed but not billable
        { where: { id: { [Op.in]: skippedIds } } }
      );
    }

    return true;
  } catch (err) {
    console.error("Error charging automation batch by date:", err);
    return false;
  }
}

// ------ WORKER ------

/**
 * Get the first automation type for an event based on EventSetting execution order.
 * Returns the baseType (e.g., 'sms', 'whatsapp', 'ai_call', 'human_call') mapped to
 * our internal type strings ('SMS', 'WhatsApp', 'AI_CALL', 'HUMAN_CALL').
 */
async function getFirstAutomationTypeForEvent(eventId) {

  const firstStep = await EventSetting.findOne({
    where: { eventId },
    order: [
      ["executionDate", "ASC"],
      ["stepOrder", "ASC"],
      ["id", "ASC"],
    ],
  });

  if (!firstStep) return null;

  // Map baseType to our internal type strings
  switch (firstStep.baseType) {
    case "sms":
      return "SMS";
    case "whatsapp":
      return "WhatsApp";
    case "ai_call":
      return "AI_CALL";
    case "human_call":
      return "HUMAN_CALL";
    default:
      return null;
  }
}

function getModelByName(modelName) {
  switch (modelName) {
    case "sms":
      return SMSAutomation;
    case "whatsapp":
      return WhatsAppAutomation;
    case "ai":
      return AICallAutomation;
    case "human":
      return HumanCallAutomation;
    case "reminder":
      return ReminderAutomation;
    default:
      throw new Error(`Unknown modelName ${modelName}`);
  }
}

// const connection = {
//   host: process.env.REDIS_HOST || "127.0.0.1",
//   port: Number(process.env.REDIS_PORT || 6379),
// };

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

function isWithinBusinessHours(userTimezone) {
  const now = moment().tz(userTimezone || "UTC");
  const hour = now.hour();
  return hour >= 10 && hour < 18;
}

function getNextBusinessHourDelay(userTimezone) {
  const now = moment().tz(userTimezone || "UTC");
  const hour = now.hour();

  if (hour < 10) {
    // Before 10 AM - wait until 10 AM today
    const next10AM = now.clone().hour(10).minute(0).second(0);
    return next10AM.diff(now);
  } else if (hour >= 18) {
    // After 6 PM - wait until 10 AM tomorrow
    const next10AM = now.clone().add(1, 'day').hour(10).minute(0).second(0);
    return next10AM.diff(now);
  }

  return 0; // Within business hours
}

const worker = new Worker(
  "automationQueue",
  async (job) => {
    const { type, modelName, taskId } = job.data;
    const Model = getModelByName(modelName);

    const task = await Model.findByPk(taskId);
    if (!task) {
      console.warn(`Task ${taskId} not found for type ${type}`);
      return;
    }

    if (task.status !== "pending") {
      // already processed / failed / etc.
      return;
    }

    const event = await Event.findByPk(task.eventId);
    if (!event) {
      console.warn(`Event ${task.eventId} not found for task ${task.id}`);
      task.status = "failed";
      await task.save();
      return;
    }

    const user = await User.findByPk(event.userId);
    if (!user) {
      console.warn(`User ${event.userId} not found for task ${task.id}`);
      task.status = "failed";
      await task.save();
      return;
    }


    // Check if current time is within business hours (10 AM to 6 PM) in user's timezone
    if (!isWithinBusinessHours(user.timezone)) {
      const delayMs = getNextBusinessHourDelay(user.timezone);

      console.log(`Rescheduling ${type} for user ${user.id} (${user.name}) - outside business hours in timezone ${user.timezone}. Will retry in ${Math.round(delayMs / 1000 / 60)} minutes`);

      // Re-enqueue the job to run at next business hour
      await automationQueue.add(
        "send-automation",
        { type, modelName, taskId },
        { delay: delayMs, attempts: 3 }
      );

      return;
    }

    const guests = await Guest.findAll({ where: { eventId: event.id } });
    const guestByToken = new Map(guests.map((g) => [g.rsvpToken, g]));
    const guest = guestByToken.get(task.rsvpToken);

    const dateKey = getDateKeyFromDate(task.scheduledAt);
    const { start, end } = getDateRangeForKey(dateKey);

    // 1) BILLING PER DATE: check if there are unbilled tasks for this event+type+date
    const unbilledTasksForDate = await Model.findAll({
      where: {
        eventId: event.id,
        status: "pending",
        billingPaymentId: { [Op.is]: null },
        scheduledAt: { [Op.gte]: start, [Op.lt]: end },
      },
    });

    if (unbilledTasksForDate.length > 0) {
      const now = new Date();
      const unbilledIds = unbilledTasksForDate.map((t) => t.id);

      // ATOMIC CLAIM: Try to mark all as "claimed" for billing
      const [affectedCount] = await Model.update(
        { billingClaimedAt: now },
        {
          where: {
            id: { [Op.in]: unbilledIds },
            billingClaimedAt: { [Op.is]: null },
            billingPaymentId: { [Op.is]: null },
          },
        }
      );

      if (affectedCount > 0) {
        // This worker won the race for at least some tasks in this batch.
        // Re-load only the tasks that we actually claimed.
        const claimedTasks = await Model.findAll({
          where: { id: { [Op.in]: unbilledIds }, billingClaimedAt: now },
        });

        if (claimedTasks.length > 0) {
          const ok = await chargeAutomationBatchForDate({
            user,
            event,
            type,
            tasksForDate: claimedTasks,
            model: Model,
            dateKey,
          });

          if (!ok) {
            console.error(
              `Billing failed for ${type} tasks event ${event.id} on ${dateKey}. Resetting batch.`
            );
            // Reset to null so it can be retried
            await Model.update(
              { billingClaimedAt: null },
              { where: { id: { [Op.in]: claimedTasks.map((t) => t.id) } } }
            );
            task.status = "failed";
            await task.save();
            return;
          }

          console.log(
            `Processed billing for batch of ${claimedTasks.length} ${type} (event ${event.id}) on ${dateKey}`
          );
        }
      } else {
        console.log(`Batch for ${type} on ${dateKey} already being processed or finished by another worker.`);
      }
    }

    // 2) SKIP CONFIRMED GUESTS (same as old automaticPause behavior)
    // if (
    //   guest &&
    //   guest.status === "confirmed" &&
    //   type !== "REMINDER_SMS" &&
    //   type !== "REMINDER_WHATSAPP"
    // ) {
    //   console.log(
    //     `Skipping ${type} for confirmed guest ${guest.name} (${guest.phone})`
    //   );
    //   task.status = "success";
    //   await task.save();
    //   return;
    // }

    // 2) FILTER BY GUEST STATUS
    // - The first automation (dynamically determined) should run for all guests.
    // - Remaining automations (WhatsApp, AI_CALL, HUMAN_CALL) should run
    //   only for guests with status 'pending' or 'hesitate'.
    if (type !== "REMINDER_SMS" && type !== "REMINDER_WHATSAPP") {
      const firstAutomationType = await getFirstAutomationTypeForEvent(event.id);

      if (type === firstAutomationType) {
        // first automation — send to everyone
      } else {
        const allowedStatuses = ["pending", "hesitate"];
        if (!guest || !allowedStatuses.includes(guest.status)) {
          console.log(
            `Skipping ${type} for guest ${guest ? guest.name : task.guestNumber} (status=${guest ? guest.status : 'missing'})`
          );
          task.status = "success";
          await task.save();
          return;
        }
      }
    }

    // 3) SEND AUTOMATION
    try {
      switch (type) {
        case "SMS": {
          const baseUrl =
            process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
          const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

          const eventName = event?.name || "";
          const eventDateObj = event?.eventDate || null;
          const location = event?.location || "";

          let formattedDate = "";
          if (eventDateObj) {
            formattedDate = new Date(eventDateObj).toLocaleDateString("he-IL");
          }

          const message = await smsService.getMessageByTemplate(
            task.templateId,
            {
              name: guest?.name || "",
              eventName,
              date: formattedDate,
              location,
              link: rsvpLink,
            }
          );

          await smsService.sendSMS(
            task.guestNumber,
            message,
            task.rsvpToken,
            task.senderName
          );
          task.status = "success";
          task.isTriggered = true;
          await task.save();

          console.log(`SMS sent to ${task.guestNumber}`);
          break;
        }

        case "WhatsApp": {
          const baseUrl =
            process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
          const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

          const eventName = event?.name || "";
          const eventDateObj = event?.eventDate || null;
          const location = event?.location || "";

          let formattedDate = "";
          if (eventDateObj) {
            formattedDate = new Date(eventDateObj).toLocaleDateString("he-IL");
          }

          const message = await smsService.getMessageByTemplate(
            task.templateId,
            {
              name: guest?.name || "",
              eventName,
              date: formattedDate,
              location,
              link: rsvpLink,
            }
          );

          // await whatsappService.sendWhatsAppTemplate(
          //   task.guestNumber,
          //   message,
          //   task.rsvpToken
          // );
          task.status = "success";
          task.isTriggered = true;
          await task.save();
          console.log(`WhatsApp sent to ${task.guestNumber}`);
          break;
        }

        case "AI_CALL": {
          console.log(`AI call triggered for ${task.guestNumber}`);

          try {
            const eventDateObjForCall = event?.eventDate || null;
            let callDate = "";
            let callTime = "";
            if (eventDateObjForCall) {
              const dt = new Date(eventDateObjForCall);
              callDate = dt.toLocaleDateString("he-IL");
              callTime = dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
            }

            // Load EventType to get the type name (wedding, birthday, etc.)
            const EventType = require("../models/eventType.model");
            const eventType = await EventType.findByPk(event.typeId);
            const eventTypeKey = getEventTypeKeyForCall(eventType?.name || "event");

            const response = await fetch(
              "https://ingestion-api-291837461617.me-west1.run.app/submit-call",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  customer_name: guest?.name || "",
                  number: task.guestNumber,
                  id: String(task.id),
                  event_id: String(event.id),
                  user_id: String(event.userId),
                  [eventTypeKey]: {
                    [event?.name || ""]: {
                      date: callDate,
                      time: callTime,
                      location: event?.location || "",
                    },
                  },
                }),
              }
            );

            if (!response.ok) {
              throw new Error(
                `API returned ${response.status}: ${response.statusText}`
              );
            }

            const data = await response.json();
            console.log("AI call API response:", data);

            task.status = "success";
            task.isTriggered = true; // NEW
            await task.save();
          } catch (err) {
            console.error(`AI call API failed for ${task.guestNumber}:`, err);
            task.status = "failed";
            await task.save();
          }

          break;
        }

        case "HUMAN_CALL":
          task.status = "success";
          task.isTriggered = true;
          await task.save();
          console.log(`Human call triggered for ${task.guestNumber}`);
          break;

        case "REMINDER_SMS": {
          const baseUrl =
            process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
          const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

          const eventName = event?.name || "";
          const eventDateObj = event?.eventDate || null;
          const location = event?.location || "";

          let formattedDate = "";
          if (eventDateObj) {
            formattedDate = new Date(eventDateObj).toLocaleDateString("he-IL");
          }

          // 🔹 NEW: load schedule to get messageText
          const schedule = await ReminderAutomationSchedule.findByPk(
            task.scheduleId
          );

          const rawTemplate = (schedule && schedule.messageText) || "";

          // 🔹 Basic placeholder replacement (supports EN + HE variants)
          const message = rawTemplate
            // name
            .replace(/{{\s*first_name\s*}}/gi, guest?.name || "")
            .replace(/\{name\}/gi, guest?.name || "")
            .replace(/\{שם\}/g, guest?.name || "")
            // event name
            .replace(/\{eventName\}/gi, eventName)
            // date
            .replace(/\{date\}/gi, formattedDate)
            .replace(/\{תאריך\}/g, formattedDate)
            // location
            .replace(/\{location\}/gi, location)
            .replace(/\{מקום\}/g, location)
            // link
            .replace(/\{link\}/gi, rsvpLink);

          await smsService.sendSMS(
            task.guestNumber,
            message,
            task.rsvpToken,
            task.senderName
          );
          task.status = "success";
          task.isTriggered = true;
          await task.save();
          break;
        }

        case "REMINDER_WHATSAPP": {
          const baseUrl =
            process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
          const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

          const eventName = event?.name || "";
          const eventDateObj = event?.eventDate || null;
          const location = event?.location || "";

          let formattedDate = "";
          if (eventDateObj) {
            formattedDate = new Date(eventDateObj).toLocaleDateString("he-IL");
          }

          // 🔹 NEW: load schedule to get messageText
          console.log(task.scheduleId, "mmmmmmmmmmmmrrrrr");
          const schedule = await ReminderAutomationSchedule.findByPk(
            task.scheduleId
          );
          console.log(schedule, "mmmmmmmmmmmmrrrrr");

          const rawTemplate = (schedule && schedule.messageText) || "";

          const message = rawTemplate
            .replace(/{{\s*first_name\s*}}/gi, guest?.name || "")
            .replace(/\{name\}/gi, guest?.name || "")
            .replace(/\{שם\}/g, guest?.name || "")
            .replace(/\{eventName\}/gi, eventName)
            .replace(/\{date\}/gi, formattedDate)
            .replace(/\{תאריך\}/g, formattedDate)
            .replace(/\{location\}/gi, location)
            .replace(/\{מקום\}/g, location)
            .replace(/\{link\}/gi, rsvpLink);

          await whatsappService.sendWhatsAppTemplate(
            task.guestNumber,
            message,
            task.rsvpToken
          );
          task.status = "success";
          task.isTriggered = true;
          await task.save();
          break;
        }
      }

      // task.status = "success";
      // await task.save();
    } catch (err) {
      console.error(`Failed to execute ${type} for ${task.guestNumber}:`, err);
      task.status = "failed";
      await task.save();
    }
  },
  { connection, concurrency: 1 } // concurrency=1 to avoid double-billing races
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

module.exports = worker;
