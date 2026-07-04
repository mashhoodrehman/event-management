const express = require("express");
const router = express.Router();
const matchingController = require("../controllers/matching.controller");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/run", authMiddleware, matchingController.runMatching);
router.get("/results/:event_uid", authMiddleware, matchingController.getMatchingResults);
router.get("/contacts/:event_uid", authMiddleware, matchingController.getEventContacts);
router.post("/confirm", authMiddleware, matchingController.confirmGuest);
router.post("/reject", authMiddleware, matchingController.rejectGuest);
router.patch("/status/:eventId", authMiddleware, matchingController.updateEventStatus);

module.exports = router;
