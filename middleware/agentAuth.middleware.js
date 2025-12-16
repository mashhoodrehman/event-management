const jwt = require("jsonwebtoken");
const Agent = require("../models/agent.model");

module.exports = async function agentAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Agent token missing" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (decoded.role !== "agent") {
      return res.status(403).json({ error: "Agent access only" });
    }

    const agent = await Agent.findByPk(decoded.id);

    if (!agent || !agent.active) {
      return res.status(401).json({ error: "Agent not found or inactive" });
    }

    // ✅ attach agent to request
    req.agent = {
      id: agent.id,
      name: agent.name,
      email: agent.email,
    };

    next();
  } catch (err) {
    console.error("agentAuth error:", err);
    return res.status(500).json({ error: "Auth server error" });
  }
};
