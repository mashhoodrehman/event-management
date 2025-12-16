// routes/agentAuth.routes.js
const router = require("express").Router();
const { agentLogin } = require("../controllers/agentAuth.controller");

router.post("/login", agentLogin);

module.exports = router;
