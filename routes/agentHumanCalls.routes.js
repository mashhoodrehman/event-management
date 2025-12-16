// routes/agentHumanCalls.routes.js
const router = require("express").Router();
const agentAuth = require("../middleware/agentAuth.middleware");
const {
  getHumanCalls,
  submitHumanCallResult,
} = require("../controllers/agentHumanCalls.controller");

router.get("/human-calls", agentAuth, getHumanCalls);
router.post("/human-calls/:id/result", agentAuth, submitHumanCallResult);

module.exports = router;
