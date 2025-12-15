const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Agent = require("../models/agent.model");

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const agent = await Agent.findOne({ where: { email } });
  if (!agent) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, agent.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: agent.id, role: "agent" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    token,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
    },
  });
});

module.exports = router;
