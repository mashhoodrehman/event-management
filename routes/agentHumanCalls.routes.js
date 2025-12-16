const router = require("express").Router();
const agentAuth = require("../middleware/agentAuth.middleware");
const {
  listHumanCallsForAgent,
  claimHumanCall,
  completeHumanCall,
} = require("../controllers/agentHumanCalls.controller");

router.get("/human-calls", agentAuth, listHumanCallsForAgent);
router.post("/human-calls/:taskId/claim", agentAuth, claimHumanCall);
router.post("/human-calls/:taskId/complete", agentAuth, completeHumanCall);

module.exports = router;
