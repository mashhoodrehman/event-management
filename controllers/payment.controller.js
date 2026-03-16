// controllers/payment.controller.js
require("dotenv").config();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const CardcomService = require("../services/cardcom.service");
const Payment = require("../models/payment.model");
const Event = require("../models/event.model");
const User = require("../models/user.model");
const Guest = require("../models/guest.model");
const EventSetting = require("../models/eventSetting.model");
const MessageTemplate = require("../models/messageTemplate.model");
const EventAutomationSchedule = require("../models/eventAutomationSchedule.model");
const sendSMS = require("../helper/sendSms");
const { createAutomations } = require("../services/automationScheduler");

const processSetupFee = async (req, res) => {
  try {
    const { eventId } = req.body;
    const userId = req.user.id;

    if (!eventId) return res.status(400).json({ error: "eventId is required" });

    // Validate event exists
    const event = await Event.findByPk(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (event.userId !== userId)
      return res.status(403).json({ error: "Unauthorized" });

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 🔹 For Cardcom, we don't necessarily need the customer existing beforehand
    // but we can still use user info.

    // 🔹 Check for existing setup fee payment for this event
    const existingPayment = await Payment.findOne({
      where: { eventId, type: "setup_fee" },
      order: [["createdAt", "DESC"]],
    });

    if (existingPayment && existingPayment.status === "succeeded") {
      return res.status(400).json({
        error: "Setup fee has already been paid for this event.",
      });
    }

    // Amount in ILS 
    const amount = 100; // Original was 100 * 100 cents. Cardcom takes ILS.

    // Indicator URL for webhook
    const indicatorUrl = `${process.env.BASE_URL}/api/cardcom/indicator`;
    const successUrl = `${process.env.FRONTEND_BASE_URL}/onboarding?step=6&eventId=${eventId}`;
    const errorUrl = `${process.env.FRONTEND_BASE_URL}/payment-error?eventId=${eventId}`;

    // Create Cardcom Payment Link
    const redirectUrl = await CardcomService.createPaymentLink({
      amount,
      eventId,
      userId,
      successUrl,
      errorUrl,
      indicatorUrl
    });

    // Save payment record as initiated (we use redirectUrl as paymentIntentId placeholder until we get InternalID)
    await Payment.create({
      eventId,
      amount: amount, // keep cents in DB for consistency
      currency: "ils",
      paymentIntentId: "pending_cardcom",
      status: "initiated",
      type: "setup_fee",
    });

    return res.status(200).json({
      message: "Cardcom link created",
      redirectUrl,
    });
  } catch (err) {
    console.error("processSetupFee error:", err);
    res.status(500).json({ error: "Cardcom Payment Error" });
  }
};

const getPaymentsByEvent = async (req, res) => {
  const { eventId } = req.query;
  const userId = req.user.id;

  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  try {
    // Verify the event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) return res.status(404).json({ error: "Event not found" });

    // Fetch all payments for this event
    const payments = await Payment.findAll({
      where: { eventId },
      order: [["createdAt", "DESC"]],
    });

    return res.json({ payments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

const checkSetupFee = async (req, res) => {
  const { eventId } = req.query;
  const userId = req.user.id;

  if (!eventId) return res.status(400).json({ error: "eventId is required" });

  try {
    const payment = await Payment.findOne({
      where: {
        eventId,
        type: "setup_fee",
        status: "succeeded"
      }
    });

    return res.json({ paid: !!payment });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { processSetupFee, getPaymentsByEvent, checkSetupFee };
