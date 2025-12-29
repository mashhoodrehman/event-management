const express = require("express");
const router = express.Router();
const {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
  getRecentActivity,
  getGuestStats,
  getPendingFollowupGuests,
  addGuestManual,
  getWeeklyActivity,
} = require("../controllers/guest.controller");
const authMiddleware = require("../middleware/authMiddleware");

// POST /api/guest/rsvp
router.post("/rsvp", updateRSVPStatus);

router.post("/add-manual", authMiddleware, addGuestManual);

router.get("/details", getGuestDetails);

router.get("/list", authMiddleware, getGuestsByFilters);

router.get("/recent-activity", authMiddleware, getRecentActivity);

router.get("/weekly-activity", authMiddleware, getWeeklyActivity);

router.get("/stats", authMiddleware, getGuestStats);

router.get("/pending-followup", authMiddleware, getPendingFollowupGuests);

module.exports = router;
