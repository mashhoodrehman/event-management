// controllers/payment.controller.js
require("dotenv").config();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Payment = require("../models/payment.model");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const sendSMS = require("../helper/sendSms");

const processSetupFee = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) return res.status(400).json({ error: "eventId is required" });

    // Validate event exists
    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Check for existing payment record
    const existingPayment = await Payment.findOne({ where: { eventId } });

    if (existingPayment) {
      // Handle already successful payment
      if (existingPayment.status === "succeeded") {
        return res.status(400).json({
          error: "Setup fee has already been paid for this event.",
        });
      }

      // If payment is initiated or requires confirmation, reuse it
      if (
        ["initiated", "processing", "requires_action"].includes(
          existingPayment.status
        )
      ) {
        return res.status(200).json({
          message: "Existing PaymentIntent found",
          clientSecret: existingPayment.clientSecret || null,
          paymentIntentId: existingPayment.paymentIntentId,
        });
      }

      // If previous attempt failed, you can delete and recreate
      if (existingPayment.status === "failed") {
        await existingPayment.destroy();
      }
    }

    // Amount in cents (e.g. $100 => 10000)
    const amount = 10000;

    // Create new PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      description: `Setup fee for event #${eventId}`,
      payment_method_types: ["card"],
      metadata: { eventId: String(eventId) },
    });

    // Save payment record
    await Payment.create({
      eventId,
      amount,
      currency: "usd",
      paymentIntentId: paymentIntent.id,
      status: "initiated",
      clientSecret: paymentIntent.client_secret, // save if needed
    });
    // ================= SEND SMS TO GUESTS =================
    const guests = await Guest.findAll({ where: { eventId } });

    // const smsUrl = process.env.SMS_API_URL;
    // const apiHeaders = { Authorization: `Bearer ${process.env.SMS_API_KEY}` };

    const message = `Hi! You are invited to the event "${event.name}". Please check details.`;

    // Send SMS to each guest sequentially
    for (const guest of guests) {
      if (guest.phone) {
        try {
          // await sendSMS(smsUrl, guest.phone, message, apiHeaders);
          console.log(`SMS sent to ${guest.phone}`);
        } catch (err) {
          console.error(`Failed to send SMS to ${guest.phone}:`, err.message);
        }
      }
    }

    // Do NOT mark event as completed here — only after success webhook
    return res.status(200).json({
      message: "PaymentIntent created",
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error("processSetupFee error:", err);
    res.status(500).json({ error: "Stripe Payment Error" });
  }
};

module.exports = { processSetupFee };
