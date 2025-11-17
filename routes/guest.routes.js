const express = require("express");
const router = express.Router();
const {
  updateRSVPStatus,
  getGuestDetails,
} = require("../controllers/guest.controller");

// POST /api/guest/rsvp
router.post("/rsvp", updateRSVPStatus);

router.get("/details", getGuestDetails);

module.exports = router;
