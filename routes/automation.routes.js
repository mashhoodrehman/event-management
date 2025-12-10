// routes/automation.routes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const { manualRunAutomation } = require("../controllers/automation.controller");

// POST /api/automation/manual-run
router.post("/manual-run", authMiddleware, manualRunAutomation);

module.exports = router;
