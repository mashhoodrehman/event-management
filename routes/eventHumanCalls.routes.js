const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  getEventHumanCalls,
  getEventHumanCallsSummary,
} = require("../controllers/eventHumanCalls.controller");

router.get("/:eventId/human-calls", authMiddleware, getEventHumanCalls);
router.get(
  "/:eventId/human-calls/summary",
  authMiddleware,
  getEventHumanCallsSummary
);

module.exports = router;
