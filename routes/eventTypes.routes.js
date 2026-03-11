const express = require("express");
const router = express.Router();
const { getEventTypes } = require("../controllers/eventType.controller");

router.get("/", getEventTypes);

module.exports = router;
