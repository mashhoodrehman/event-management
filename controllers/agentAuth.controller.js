// controllers/agentAuth.controller.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Agent = require("../models/agent.model");

exports.agentLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const agent = await Agent.findOne({ where: { email } });

    if (!agent || !agent.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, agent.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: agent.id, role: "agent" },
      process.env.AGENT_JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      token,
      agent: { id: agent.id, name: agent.name, email: agent.email },
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
