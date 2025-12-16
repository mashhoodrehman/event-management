const express = require("express");
const router = express.Router();

const {
  getRemindersByEvent,
  createReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
} = require("../controllers/reminder.controller");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/", getRemindersByEvent);
router.post("/", createReminder);
router.put("/:id", updateReminder);
router.delete("/:id", deleteReminder);
router.patch("/:id/toggle", toggleReminderActive);

module.exports = router;
