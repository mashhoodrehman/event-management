const cron = require("node-cron");
const { Op } = require("sequelize");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const smsService = require("../services/sms.service");
const whatsappService = require("../services/whatsapp.service");
const Event = require("../models/event.model");
const EventSetting = require("../models/eventSetting.model");
const Guest = require("../models/guest.model");
const User = require("../models/user.model");
const Payment = require("../models/payment.model");

// Pricing (per item) in agorot (smallest unit for ILS)
const SMS_PRICE = parseInt(process.env.SMS_PRICE_AGOROT || "15", 10);
const WHATSAPP_PRICE = parseInt(process.env.WHATSAPP_PRICE_AGOROT || "25", 10);
const AICALL_PRICE = parseInt(process.env.AICALL_PRICE_AGOROT || "250", 10);
const HUMANCALL_PRICE = parseInt(
  process.env.HUMANCALL_PRICE_AGOROT || "1500",
  10
);

const MIN_STRIPE_AMOUNT_AGOROT = parseInt(
  process.env.MIN_STRIPE_AMOUNT_AGOROT || "50",
  10
);

function getPriceForType(type) {
  switch (type) {
    case "SMS":
      return SMS_PRICE;
    case "WhatsApp":
      return WHATSAPP_PRICE;
    case "AI_CALL":
      return AICALL_PRICE;
    case "HUMAN_CALL":
      return HUMANCALL_PRICE;
    default:
      return 0;
  }
}

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
    default:
      return "sms_fee";
  }
}

/**
 * Charge batch for ALL unbilled tasks of one event & type,
 * then mark those tasks with billingPaymentId.
 */
async function chargeAutomationBatch(user, event, type, tasksToBill, model) {
  try {
    const pricePerUnit = getPriceForType(type);
    if (!pricePerUnit) {
      console.warn(`No price configured for type ${type}, skipping billing.`);
      return true; // treat as free
    }

    if (!user || !user.stripeCustomerId) {
      console.error(
        `Cannot charge automation batch: missing Stripe customer for user ${user?.id}`
      );
      return false;
    }

    const amountCents = pricePerUnit * tasksToBill.length;
    if (amountCents <= 0) return true;

    // Get saved card
    const pms = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: "card",
      limit: 1,
    });

    if (!pms.data || pms.data.length === 0) {
      console.error(
        `No payment method found for customer ${user.stripeCustomerId}`
      );
      return false;
    }

    const paymentMethod = pms.data[0];
    const automationPaymentType = mapAutomationTypeToPaymentType(type);

    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "ils",
      customer: user.stripeCustomerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: `${type} automation batch for event #${event.id}`,
      metadata: {
        eventId: String(event.id),
        paymentType: automationPaymentType,
        automationType: type,
        batchSize: String(tasksToBill.length),
      },
    });

    const statusMap = {
      succeeded: "succeeded",
      requires_action: "requires_action",
      processing: "initiated",
      requires_payment_method: "failed",
    };
    const paymentStatus = statusMap[pi.status] || "initiated";

    const payment = await Payment.create({
      eventId: event.id,
      amount: amountCents,
      currency: "ils",
      paymentIntentId: pi.id,
      type: automationPaymentType,
      status: paymentStatus,
    });

    if (pi.status !== "succeeded") {
      console.error(
        `Automation charge for ${type} event ${event.id} not succeeded: ${pi.status}`
      );
      return false;
    }

    // ✅ Mark all these tasks as billed with this Payment.id
    const ids = tasksToBill.map((t) => t.id);
    await model.update(
      { billingPaymentId: payment.id },
      {
        where: { id: { [Op.in]: ids } },
      }
    );

    return true;
  } catch (err) {
    console.error("Error charging automation batch:", err);
    return false;
  }
}

/**
 * Execute due tasks for a given model & automation type
 * - Groups by eventId
 * - Respects:
 *    - automaticSending (Start process automatically…)
 *    - automaticPause (Stop process for confirmed guests)
 * - BEFORE first send for a group of unbilled tasks:
 *   charge once for ALL unbilled tasks for that event & type.
 */
async function processAutomation(model, type) {
  const now = new Date();
  const tasks = await model.findAll({
    where: {
      scheduledAt: { [Op.lte]: now },
      status: "pending",
    },
  });

  if (!tasks.length) return;

  // Group due tasks by eventId
  const byEvent = tasks.reduce((acc, t) => {
    if (!acc[t.eventId]) acc[t.eventId] = [];
    acc[t.eventId].push(t);
    return acc;
  }, {});

  for (const [eventIdStr, dueTasks] of Object.entries(byEvent)) {
    const eventId = parseInt(eventIdStr, 10);
    const event = await Event.findByPk(eventId);
    if (!event) continue;

    const settings = await EventSetting.findOne({ where: { eventId } });
    if (!settings) {
      console.warn(`No settings for event ${eventId}, skipping ${type}`);
      continue;
    }

    // 🔹 Respect "Start process automatically on the scheduled date"
    if (!settings.automaticSending) {
      console.log(
        `automaticSending is OFF – skipping automatic ${type} for event ${eventId}`
      );
      continue;
    }

    const guests = await Guest.findAll({ where: { eventId } });
    const guestByToken = new Map(guests.map((g) => [g.rsvpToken, g]));

    // Filter *due* tasks that should be sent now (respect automaticPause)
    const deliverable = [];
    for (const task of dueTasks) {
      const guest = guestByToken.get(task.rsvpToken);

      if (settings.automaticPause && guest && guest.status === "confirmed") {
        console.log(
          `Skipping ${type} for confirmed guest ${guest.name} (${guest.phone})`
        );
        task.status = "success"; // we treat this as completed
        await task.save();
        continue;
      }

      deliverable.push({ task, guest });
    }

    if (!deliverable.length) continue;

    const user = await User.findByPk(event.userId);
    if (!user) {
      console.error(`User ${event.userId} not found, cannot bill automations`);
      for (const { task } of deliverable) {
        task.status = "failed";
        await task.save();
      }
      continue;
    }

    // 🔹 Check if there are ANY unbilled tasks for this event & type
    const unbilledTasksForEventType = await model.findAll({
      where: {
        eventId,
        status: "pending",
        billingPaymentId: { [Op.is]: null },
      },
    });

    if (unbilledTasksForEventType.length > 0) {
      // This includes future scheduled ones as well
      const chargeOk = await chargeAutomationBatch(
        user,
        event,
        type,
        unbilledTasksForEventType,
        model
      );

      if (!chargeOk) {
        console.error(
          `Billing failed for ${type} unbilled tasks of event ${eventId}, not sending any.`
        );
        // Option: keep them pending so you can retry billing later.
        // Here I mark the *due* ones as failed to avoid a tight loop.
        for (const { task } of deliverable) {
          task.status = "failed";
          await task.save();
        }
        continue;
      }

      console.log(
        `Charged successfully for ${unbilledTasksForEventType.length} unbilled ${type} tasks of event ${eventId}.`
      );
    } else {
      console.log(
        `No unbilled ${type} tasks for event ${eventId}, using existing payments.`
      );
    }

    // ✅ Now all tasks (including those due) are billed → send due ones
    for (const { task, guest } of deliverable) {
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
              formattedDate = new Date(eventDateObj).toLocaleDateString(
                "he-IL"
              );
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

            console.log(`SMS sent to ${task.guestNumber}`);
            break;
          }

          case "WhatsApp": {
            await whatsappService.sendWhatsAppTemplate(task.guestNumber, {
              name: guest?.name,
              simId: task.templateId, // adjust if your template uses something else
            });
            console.log(`WhatsApp sent to ${task.guestNumber}`);
            break;
          }

          case "AI_CALL":
            console.log(`AI call triggered for ${task.guestNumber}`);
            break;

          case "HUMAN_CALL":
            console.log(`Human call triggered for ${task.guestNumber}`);
            break;
        }

        task.status = "success";
        await task.save();
      } catch (err) {
        console.error(
          `Failed to execute ${type} for ${task.guestNumber}:`,
          err
        );
        task.status = "failed";
        await task.save();
      }
    }
  }
}

/**
 * Cron job to run every minute
 */
cron.schedule("* * * * *", async () => {
  console.log("Running automation cron job...", new Date());

  await processAutomation(SMSAutomation, "SMS");
  await processAutomation(WhatsAppAutomation, "WhatsApp");
  await processAutomation(AICallAutomation, "AI_CALL");
  await processAutomation(HumanCallAutomation, "HUMAN_CALL");
});

//////////////////////////////////////////////////////////////////////
// const cron = require("node-cron");
// const { Op } = require("sequelize");
// const Stripe = require("stripe");
// const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// const SMSAutomation = require("../models/smsAutomation.model");
// const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
// const AICallAutomation = require("../models/aICallAutomation.model");
// const HumanCallAutomation = require("../models/humanCallAutomation.model");
// const smsService = require("../services/sms.service");
// const whatsappService = require("../services/whatsapp.service");
// const Event = require("../models/event.model");
// const EventSetting = require("../models/eventSetting.model");
// const Guest = require("../models/guest.model");
// const User = require("../models/user.model");
// const Payment = require("../models/payment.model");

// // Pricing (per item) in cents
// const SMS_PRICE = parseInt(process.env.SMS_PRICE_CENTS || "100", 10);
// const WHATSAPP_PRICE = parseInt(process.env.WHATSAPP_PRICE_CENTS || "100", 10);
// const AICALL_PRICE = parseInt(process.env.AICALL_PRICE_CENTS || "100", 10);
// const HUMANCALL_PRICE = parseInt(
//   process.env.HUMANCALL_PRICE_CENTS || "100",
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
//     default:
//       return 0;
//   }
// }

// function mapAutomationTypeToPaymentType(type) {
//   switch (type) {
//     case "SMS":
//       return "sms_fee";
//     case "WhatsApp":
//       return "whatsapp_fee";
//     case "AI_CALL":
//       return "ai_call_fee";
//     case "HUMAN_CALL":
//       return "human_call_fee";
//     default:
//       return "sms_fee";
//   }
// }

// /**
//  * Charge a full batch of automation tasks for one event & type
//  */
// async function chargeAutomationBatch(user, event, type, tasks) {
//   try {
//     const pricePerUnit = getPriceForType(type);
//     if (!pricePerUnit) {
//       console.warn(`No price configured for type ${type}, skipping billing.`);
//       return true; // treat as free
//     }

//     if (!user || !user.stripeCustomerId) {
//       console.error(
//         `Cannot charge automation batch: missing Stripe customer for user ${user?.id}`
//       );
//       return false;
//     }

//     const amountCents = pricePerUnit * tasks.length;
//     if (amountCents <= 0) return true;

//     // Get saved card
//     const pms = await stripe.paymentMethods.list({
//       customer: user.stripeCustomerId,
//       type: "card",
//       limit: 1,
//     });

//     if (!pms.data || pms.data.length === 0) {
//       console.error(
//         `No payment method found for customer ${user.stripeCustomerId}`
//       );
//       return false;
//     }

//     const paymentMethod = pms.data[0];

//     const automationPaymentType = mapAutomationTypeToPaymentType(type);

//     const pi = await stripe.paymentIntents.create({
//       amount: amountCents,
//       currency: "usd",
//       customer: user.stripeCustomerId,
//       payment_method: paymentMethod.id,
//       off_session: true,
//       confirm: true,
//       description: `${type} automation batch for event #${event.id}`,
//       metadata: {
//         eventId: String(event.id),
//         paymentType: automationPaymentType,
//         automationType: type,
//         batchSize: String(tasks.length),
//       },
//     });

//     const statusMap = {
//       succeeded: "succeeded",
//       requires_action: "requires_action",
//       processing: "initiated",
//       requires_payment_method: "failed",
//     };
//     const paymentStatus = statusMap[pi.status] || "initiated";

//     await Payment.create({
//       eventId: event.id,
//       amount: amountCents,
//       currency: "usd",
//       paymentIntentId: pi.id,
//       type: automationPaymentType,
//       status: paymentStatus,
//     });

//     if (pi.status === "succeeded") return true;

//     console.error(
//       `Automation charge for ${type} event ${event.id} not succeeded: ${pi.status}`
//     );
//     return false;
//   } catch (err) {
//     console.error("Error charging automation batch:", err);
//     return false;
//   }
// }

// /**
//  * Execute due tasks for a given model & automation type
//  * - Groups by eventId
//  * - Respects:
//  *    - automaticSending (Start process automatically…)
//  *    - automaticPause (Stop process for confirmed guests)
//  * - Charges full batch BEFORE sending
//  */
// async function processAutomation(model, type) {
//   const now = new Date();
//   const tasks = await model.findAll({
//     where: {
//       scheduledAt: { [Op.lte]: now },
//       status: "pending",
//     },
//   });

//   if (!tasks.length) return;

//   // Group by eventId
//   const byEvent = tasks.reduce((acc, t) => {
//     if (!acc[t.eventId]) acc[t.eventId] = [];
//     acc[t.eventId].push(t);
//     return acc;
//   }, {});

//   for (const [eventIdStr, eventTasks] of Object.entries(byEvent)) {
//     const eventId = parseInt(eventIdStr, 10);
//     const event = await Event.findByPk(eventId);
//     if (!event) continue;

//     const settings = await EventSetting.findOne({ where: { eventId } });
//     if (!settings) {
//       console.warn(`No settings for event ${eventId}, skipping ${type}`);
//       continue;
//     }

//     // 🔹 Respect "Start process automatically on the scheduled date"
//     if (!settings.automaticSending) {
//       console.log(
//         `automaticSending is OFF – skipping automatic ${type} for event ${eventId}`
//       );
//       continue;
//     }

//     // Load guests for automaticPause logic & personalization
//     const guests = await Guest.findAll({ where: { eventId } });
//     const guestByToken = new Map(guests.map((g) => [g.rsvpToken, g]));

//     // Filter tasks:
//     // - if automaticPause and guest is confirmed => skip sending + mark success
//     const deliverable = [];

//     for (const task of eventTasks) {
//       const guest = guestByToken.get(task.rsvpToken);

//       if (settings.automaticPause && guest && guest.status === "confirmed") {
//         // Guest already confirmed → skip automation for them
//         console.log(
//           `Skipping ${type} for confirmed guest ${guest.name} (${guest.phone})`
//         );
//         task.status = "success"; // treated as done
//         await task.save();
//         continue;
//       }

//       // otherwise, this is a billable + sendable task
//       deliverable.push({ task, guest });
//     }

//     if (!deliverable.length) continue;

//     const user = await User.findByPk(event.userId);
//     if (!user) {
//       console.error(`User ${event.userId} not found, cannot bill automations`);
//       // Mark them as failed to avoid infinite loops
//       for (const { task } of deliverable) {
//         task.status = "failed";
//         await task.save();
//       }
//       continue;
//     }

//     // 🔹 Charge full batch BEFORE sending

//     const chargeOk = await chargeAutomationBatch(
//       user,
//       event,
//       type,
//       deliverable.map((d) => d.task)
//     );

//     if (!chargeOk) {
//       // If billing fails → do NOT send anything, mark tasks as failed
//       console.error(
//         `Billing failed for ${type} batch on event ${eventId}, not sending messages`
//       );
//       for (const { task } of deliverable) {
//         task.status = "failed";
//         await task.save();
//       }
//       continue;
//     }

//     // ✅ Billing ok → send messages / calls
//     for (const { task, guest } of deliverable) {
//       try {
//         switch (type) {
//           case "SMS": {
//             const baseUrl =
//               process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
//             const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

//             const eventName = event?.name || "";
//             const eventDateObj = event?.eventDate || null;
//             const location = event?.location || "";

//             let formattedDate = "";
//             if (eventDateObj) {
//               formattedDate = new Date(eventDateObj).toLocaleDateString(
//                 "he-IL"
//               );
//             }

//             const message = await smsService.getMessageByTemplate(
//               task.templateId,
//               {
//                 name: guest?.name || "",
//                 eventName,
//                 date: formattedDate,
//                 location,
//                 link: rsvpLink,
//               }
//             );

//             await smsService.sendSMS(
//               task.guestNumber,
//               message,
//               task.rsvpToken,
//               task.senderName
//             );

//             console.log(`SMS sent to ${task.guestNumber}`);
//             break;
//           }

//           case "WhatsApp": {
//             await whatsappService.sendWhatsAppTemplate(task.guestNumber, {
//               name: guest?.name,
//               simId: task.templateId, // adjust if your template uses something else
//             });
//             console.log(`WhatsApp sent to ${task.guestNumber}`);
//             break;
//           }

//           case "AI_CALL":
//             console.log(`AI call triggered for ${task.guestNumber}`);
//             break;

//           case "HUMAN_CALL":
//             console.log(`Human call triggered for ${task.guestNumber}`);
//             break;
//         }

//         task.status = "success";
//         await task.save();
//       } catch (err) {
//         console.error(
//           `Failed to execute ${type} for ${task.guestNumber}:`,
//           err
//         );
//         task.status = "failed";
//         await task.save();
//       }
//     }
//   }
// }

// /**
//  * Cron job to run every minute
//  */
// cron.schedule("* * * * *", async () => {
//   console.log("Running automation cron job...", new Date());

//   await processAutomation(SMSAutomation, "SMS");
//   await processAutomation(WhatsAppAutomation, "WhatsApp");
//   await processAutomation(AICallAutomation, "AI_CALL");
//   await processAutomation(HumanCallAutomation, "HUMAN_CALL");
// });

//////////////////////////////////////////////////////////////////////
// const cron = require("node-cron");
// const { Op } = require("sequelize"); // << add this
// const SMSAutomation = require("../models/smsAutomation.model");
// const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
// const AICallAutomation = require("../models/aICallAutomation.model");
// const HumanCallAutomation = require("../models/humanCallAutomation.model");
// const smsService = require("../services/sms.service");
// const whatsappService = require("../services/whatsapp.service");
// const Event = require("../models/event.model"); // 👈 add this

// // You can add WhatsApp, AI, Human Call helpers similarly

// /**
//  * Execute due tasks for a given model
//  */
// async function processAutomation(model, type) {
//   const now = new Date();
//   const tasks = await model.findAll({
//     where: {
//       scheduledAt: { [Op.lte]: now },
//       status: "pending",
//     },
//   });

//   for (const task of tasks) {
//     try {
//       switch (type) {
//         case "SMS":
//           if (task.guestNumber) {
//             const event = task.eventId
//               ? await Event.findByPk(task.eventId)
//               : null;

//             // 🔹 Build RSVP link
//             const baseUrl =
//               process.env.FRONTEND_BASE_URL || "http://localhost:8080/rsvp";
//             const rsvpLink = `${baseUrl}?token=${task.rsvpToken}`;

//             // 🔹 Choose values (from Event first, fall back to task fields if exist)
//             const eventName = event?.name || task.eventName || "";
//             const eventDateObj = event?.eventDate || task.eventDate || null;
//             const location = event?.location || task.location || "";

//             // Format date for SMS (you can change format as needed)
//             let formattedDate = "";
//             if (eventDateObj) {
//               formattedDate = new Date(eventDateObj).toLocaleDateString(
//                 "he-IL"
//               );
//             }

//             // 1. get message using template ID with variables
//             const message = await smsService.getMessageByTemplate(
//               task.templateId,
//               {
//                 name: task.guestName || "", // {name}
//                 eventName, // {eventName}
//                 date: formattedDate, // {date}
//                 location, // {location}
//                 link: rsvpLink, // {link}
//               }
//             );

//             // 2. send the SMS
//             await smsService.sendSMS(
//               task.guestNumber,
//               message,
//               task.rsvpToken,
//               task.senderName
//             );

//             console.log(`SMS sent to ${task.guestNumber}`);
//           }
//           break;
//         case "WhatsApp":
//           if (task.guestNumber) {
//             // Adjust field names according to your WhatsAppAutomation model
//             await whatsappService.sendWhatsAppTemplate(task.guestNumber, {
//               name: task.guestName, // used for {{1}}
//               simId: task.templateId, // used for {{2}} – change if needed
//             });

//             // console.log(`WhatsApp sent to ${task.guestNumber}`);
//           }
//           break;
//         case "AI_CALL":
//           console.log(`AI call triggered for ${task.guestNumber}`);
//           break;
//         case "HUMAN_CALL":
//           console.log(`Human call triggered for ${task.guestNumber}`);
//           break;
//       }

//       task.status = "success";
//       await task.save();
//     } catch (err) {
//       console.error(`Failed to execute ${type} for ${task.guestNumber}:`, err);
//       task.status = "failed";
//       await task.save();
//     }
//   }
// }

// /**
//  * Cron job to run every minute
//  */
// cron.schedule("* * * * *", async () => {
//   console.log("Running automation cron job...", new Date());

//   await processAutomation(SMSAutomation, "SMS");
//   await processAutomation(WhatsAppAutomation, "WhatsApp");
//   await processAutomation(AICallAutomation, "AI_CALL");
//   await processAutomation(HumanCallAutomation, "HUMAN_CALL");
// });
