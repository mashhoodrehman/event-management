const express = require("express");
const router = express.Router();
// const {
//   createEvent,
//   getUserEvents,
// } = require("../controllers/event.controller");
const {
  createOrUpdateEvent,
  addOrUpdateGuests,
  updateEventSettings,
  saveMessageTemplate,

  getEventDetails,
  getUserEvents,
  getEventAutomationStats,
  getChannelResponseRates,
} = require("../controllers/event.controller");
const {
  processSetupFee,
  getPaymentsByEvent,
} = require("../controllers/payment.controller");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
// Step 1: Basic Event Details
router.post(
  "/detail",
  authMiddleware,
  upload.single("invitationFile"),
  createOrUpdateEvent
);

// Step 2: Guest List
router.post(
  "/guest-list",
  authMiddleware,
  upload.fields([{ name: "guestListFile", maxCount: 1 }]),
  addOrUpdateGuests
);

// Step 3: Event Settings
router.post("/automations", authMiddleware, updateEventSettings);

router.post("/message-template", authMiddleware, saveMessageTemplate);
// router.post("/automation-schedule", authMiddleware, saveEventSchedule);
router.post("/setup-fee", authMiddleware, processSetupFee);
router.get("/payments", authMiddleware, getPaymentsByEvent);
router.get("/list", authMiddleware, getUserEvents);
router.get("/details/:eventId", authMiddleware, getEventDetails);
router.get("/stats/:eventId", authMiddleware, getEventAutomationStats);
router.get(
  "/channel-response/:eventId",
  authMiddleware,
  getChannelResponseRates
);

// router.post(
//   "/create",
//   // upload.single("invitationFile"),
//   upload.fields([
//     { name: "invitationFile", maxCount: 1 },
//     { name: "guestListFile", maxCount: 1 },
//   ]),
//   authMiddleware,
//   createEvent
// );
// router.get("/user", authMiddleware, getUserEvents);

module.exports = router;
