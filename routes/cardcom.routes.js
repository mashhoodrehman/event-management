const express = require("express");
const router = express.Router();
const { cardcomWebhook } = require("../controllers/cardcom.controller");

// Cardcom will POST to this URL
// You should set this in your Cardcom profile or pass it as IndicatorURL
router.post("/indicator", cardcomWebhook);

module.exports = router;
