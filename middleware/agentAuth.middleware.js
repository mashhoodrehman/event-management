// middleware/agentAuth.middleware.js
const jwt = require("jsonwebtoken");
const Agent = require("../models/agent.model");

module.exports = async function agentAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Agent token missing" });

    const decoded = jwt.verify(token, process.env.AGENT_JWT_SECRET);
    const agent = await Agent.findByPk(decoded.id);

    if (!agent || !agent.isActive) {
      return res.status(401).json({ error: "Invalid agent" });
    }

    req.agent = { id: agent.id, email: agent.email, name: agent.name };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
