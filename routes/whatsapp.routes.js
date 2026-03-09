const express = require("express");
const router = express.Router();
const whatsappController = require("../controllers/whatsapp.controller");

// RSVP Endpoint (POST /api/whatsapp/rsvp)
router.post("/status", whatsappController.handleRSVP);

module.exports = router;
