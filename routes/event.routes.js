const express = require("express");
const router = express.Router();
const {
  createEvent,
  getUserEvents,
} = require("../controllers/event.controller");
const authMiddleware = require("../middleware/authMiddleware");

router.post("/create", authMiddleware, createEvent);
router.get("/user", authMiddleware, getUserEvents);

module.exports = router;
