// controllers/stripe.controller.js
require("dotenv").config();
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Payment = require("../models/payment.model");
const Event = require("../models/event.model");

// Note: Since webhook route uses express.raw(), req.body will be raw Buffer
const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("⚠️ Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log("PaymentIntent succeeded:", pi.id);

        // Update Payment record
        const payment = await Payment.findOne({
          where: { paymentIntentId: pi.id },
        });
        if (payment) {
          payment.status = "succeeded";
          await payment.save();
          // Update event status to completed
          await Event.update(
            { status: "completed" },
            { where: { id: payment.eventId } }
          );
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log("PaymentIntent failed:", pi.id);

        const payment = await Payment.findOne({
          where: { paymentIntentId: pi.id },
        });
        if (payment) {
          payment.status = "failed";
          await payment.save();
          // Optionally: set event.status to previous step or a 'payment_failed' status
          await Event.update(
            { status: "step6_failed" },
            { where: { id: payment.eventId } }
          );
        }
        break;
      }

      case "payment_intent.requires_action":
      case "payment_intent.processing":
        // handle other statuses if needed
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send();
  }
};

module.exports = { stripeWebhook };
