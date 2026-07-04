// workers/reminderWorker.js
require("dotenv").config();

const { Worker } = require("bullmq");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const { connection, REMINDER_QUEUE_NAME } = require("../queues/reminderQueue");

const ReminderAutomationSchedule = require("../models/reminderAutomationSchedule.model");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const User = require("../models/user.model");
const Payment = require("../models/payment.model");

const smsService = require("../services/sms.service");
const whatsappService = require("../services/whatsapp.service");

// pricing (agorot)
const SMS_PRICE = parseInt(process.env.SMS_PRICE_AGOROT || "15", 10);
const WHATSAPP_PRICE = parseInt(process.env.WHATSAPP_PRICE_AGOROT || "25", 10);

function mapChannelToPaymentType(channel) {
  switch (channel) {
    case "sms":
      return "sms_fee";
    case "whatsapp":
      return "whatsapp_fee";
    default:
      return "sms_fee";
  }
}

function fillTemplate(text, guest, event) {
  if (!text) return "";
  let t = text;

  const name = guest?.name || "";
  const eventName = event?.name || "";
  const eventDate = event?.eventDate
    ? new Date(event.eventDate).toLocaleDateString("he-IL")
    : "";
  const location = event?.location || event?.locationName || "";

  t = t.replace(/{שם}/g, name);
  t = t.replace(/{{first_name}}/g, name);
  t = t.replace(/{תאריך}/g, eventDate);
  t = t.replace(/{מקום}/g, location);
  t = t.replace(/{שם_אירוע}/g, eventName);

  return t;
}

async function chargeReminderBatch({ user, event, channel, count }) {
  if (!user || !user.stripeCustomerId) {
    console.error(
      `Cannot charge reminder batch: missing Stripe customer for user ${user?.id}`
    );
    return null;
  }

  const pricePerUnit =
    channel === "sms" ? SMS_PRICE : channel === "whatsapp" ? WHATSAPP_PRICE : 0;

  if (!pricePerUnit) {
    console.warn(`No price configured for channel=${channel}`);
    return null;
  }

  const amountCents = pricePerUnit * count;
  if (amountCents <= 0) return null;

  const pms = await stripe.paymentMethods.list({
    customer: user.stripeCustomerId,
    type: "card",
    limit: 1,
  });

  if (!pms.data || pms.data.length === 0) {
    console.error(
      `No payment method found for customer ${user.stripeCustomerId}`
    );
    return null;
  }

  const paymentMethod = pms.data[0];
  const paymentType = mapChannelToPaymentType(channel);

  const pi = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "ils",
    customer: user.stripeCustomerId,
    payment_method: paymentMethod.id,
    off_session: true,
    confirm: true,
    description: `Reminder ${channel.toUpperCase()} batch for event #${
      event.id
    }`,
    metadata: {
      eventId: String(event.id),
      paymentType,
      reminderChannel: channel,
      batchSize: String(count),
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
    type: paymentType,
    status: paymentStatus,
  });

  if (pi.status !== "succeeded") {
    console.error(
      `Reminder charge for channel=${channel} event ${event.id} not succeeded: ${pi.status}`
    );
    return null;
  }

  console.log(
    `✅ Reminder charge succeeded: event=${event.id}, channel=${channel}, count=${count}`
  );

  return payment;
}

/**
 * BullMQ Worker – processes jobs from the "reminders" queue
 */
const reminderWorker = new Worker(
  REMINDER_QUEUE_NAME,
  async (job) => {
    const { scheduleId, eventId } = job.data || {};
    console.log(
      `⏰ [BullMQ] Processing reminder job: scheduleId=${scheduleId}, eventId=${eventId}, jobId=${job.id}`
    );

    const now = new Date();
    const schedule = await ReminderAutomationSchedule.findByPk(scheduleId);

    if (!schedule) {
      console.warn(`Schedule ${scheduleId} not found, skipping job`);
      return;
    }

    const sendAt = new Date(schedule.sendDateTime);
    if (!schedule.isActive) {
      console.log(`Schedule ${schedule.id} is inactive, skipping.`);
      return;
    }

    // if schedule was moved to the future after job was created → don't send now
    if (sendAt.getTime() - now.getTime() > 60 * 1000) {
      console.log(
        `Schedule ${schedule.id} sendDateTime moved to future, skipping this run.`
      );
      return;
    }

    const event = await Event.findByPk(schedule.eventId || eventId);
    if (!event) {
      console.warn(`Event ${schedule.eventId} not found, skipping`);
      return;
    }

    const user = await User.findByPk(event.userId);
    if (!user) {
      console.warn(`User ${event.userId} not found, skipping`);
      return;
    }

    // pick guests
    let guestWhere = { eventId: event.id };

    if (schedule.targetAudience === "confirmed") {
      guestWhere = { ...guestWhere, status: "confirmed" };
    }
    // "all" => no extra filter; "custom" you can extend later.

    const guests = await Guest.findAll({ where: guestWhere });

    if (!guests.length) {
      console.log(
        `No guests found for schedule ${schedule.id}, event ${event.id}`
      );
      return;
    }

    const channel = schedule.channel;
    const messageTemplate = schedule.messageText;

    // charge once per batch
    const payment = await chargeReminderBatch({
      user,
      event,
      channel,
      count: guests.length,
    });

    if (!payment) {
      console.error(
        `Reminder schedule ${schedule.id} billing failed. Not sending messages.`
      );
      return;
    }

    // send messages
    for (const guest of guests) {
      try {
        const text = fillTemplate(messageTemplate, guest, event);

        if (channel === "sms") {
          await smsService.sendSMS(guest.phone, text, guest.rsvpToken, null);
        } else if (channel === "whatsapp") {
          await whatsappService.sendWhatsAppTemplate(
            guest.phone,
            text,
            guest.rsvpToken
          );
        }

        console.log(
          `Schedule ${schedule.id} (${channel}) sent to ${guest.name} ${guest.phone}`
        );
      } catch (err) {
        console.error(
          `Failed to send schedule ${schedule.id} to ${guest.phone}:`,
          err
        );
      }
    }

    schedule.sentCount = guests.length;
    schedule.plannedRecipients = guests.length;
    schedule.lastRunAt = new Date();
    await schedule.save();

    console.log(
      `✅ [BullMQ] Reminder job done: scheduleId=${schedule.id}, count=${guests.length}`
    );
  },
  { connection }
);

// Optional: log events
reminderWorker.on("completed", (job) => {
  console.log(`🎉 [BullMQ] Reminder job ${job.id} completed`);
});

reminderWorker.on("failed", (job, err) => {
  console.error(`💥 [BullMQ] Reminder job ${job?.id} failed:`, err);
});

module.exports = reminderWorker;
