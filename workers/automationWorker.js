// workers/automationWorker.js
const { Worker } = require("bullmq");
const { Op } = require("sequelize");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { automationQueue } = require("../queues/automationQueue");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const User = require("../models/user.model");
const Payment = require("../models/payment.model");
const smsService = require("../services/sms.service");
const whatsappService = require("../services/whatsapp.service");
const fs = require("fs");
const path = require("path");
const transporter = require("../config/email");

// ------ helpers shared with previous cron file ------

const SMS_PRICE = parseInt(process.env.SMS_PRICE_AGOROT || "15", 10);
const WHATSAPP_PRICE = parseInt(process.env.WHATSAPP_PRICE_AGOROT || "25", 10);
const AICALL_PRICE = parseInt(process.env.AICALL_PRICE_AGOROT || "250", 10);
const HUMANCALL_PRICE = parseInt(
  process.env.HUMANCALL_PRICE_AGOROT || "1500",
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

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: `Automation charge for event "${
        event?.name || ""
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
    const pricePerUnit = getPriceForType(type);
    if (!pricePerUnit) {
      console.warn(`No price configured for type ${type}, skipping billing.`);
      return true;
    }

    if (!user || !user.stripeCustomerId) {
      console.error(
        `Cannot charge automation batch: missing Stripe customer for user ${user?.id}`
      );
      return false;
    }

    const amountCents = pricePerUnit * tasksForDate.length;
    if (amountCents <= 0) return true;

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
      description: `${type} automation batch for event #${event.id} on date ${dateKey}`,
      metadata: {
        eventId: String(event.id),
        paymentType: automationPaymentType,
        automationType: type,
        batchSize: String(tasksForDate.length),
        automationDate: dateKey,
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
        `Automation charge for ${type} event ${event.id} [${dateKey}] not succeeded: ${pi.status}`
      );
      return false;
    }

    await sendAutomationChargeEmail({
      user,
      event,
      type,
      quantity: tasksForDate.length,
      unitPriceAgorot: pricePerUnit,
      totalAgorot: amountCents,
      payment,
      dateKey,
    });

    const ids = tasksForDate.map((t) => t.id);
    await model.update(
      { billingPaymentId: payment.id },
      { where: { id: { [Op.in]: ids } } }
    );

    return true;
  } catch (err) {
    console.error("Error charging automation batch by date:", err);
    return false;
  }
}

// ------ WORKER ------

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
    default:
      return SMSAutomation;
  }
}

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

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
      const ok = await chargeAutomationBatchForDate({
        user,
        event,
        type,
        tasksForDate: unbilledTasksForDate,
        model: Model,
        dateKey,
      });

      if (!ok) {
        console.error(
          `Billing failed for ${type} tasks event ${event.id} on ${dateKey}`
        );
        task.status = "failed";
        await task.save();
        return;
      }

      console.log(
        `Charged successfully for ${unbilledTasksForDate.length} ${type} tasks of event ${event.id} on ${dateKey}`
      );
    }

    // 2) SKIP CONFIRMED GUESTS (same as old automaticPause behavior)
    if (guest && guest.status === "confirmed") {
      console.log(
        `Skipping ${type} for confirmed guest ${guest.name} (${guest.phone})`
      );
      task.status = "success";
      await task.save();
      return;
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

          await whatsappService.sendWhatsAppTemplate(
            task.guestNumber,
            message,
            task.rsvpToken
          );
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
