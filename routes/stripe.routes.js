// routes/stripe.routes.js
const express = require("express");
const router = express.Router();
const { stripeWebhook } = require("../controllers/stripe.controller");

// IMPORTANT: Use express.raw to get the raw request body for signature verification
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

module.exports = router;
