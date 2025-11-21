const express = require("express");
const router = express.Router();
const {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
} = require("../controllers/guest.controller");
const authMiddleware = require("../middleware/authMiddleware");

// POST /api/guest/rsvp
router.post("/rsvp", updateRSVPStatus);

router.get("/details", getGuestDetails);

router.get("/list", authMiddleware, getGuestsByFilters);

module.exports = router;
