// seed/agentSeeder.js
const bcrypt = require("bcrypt");
const Agent = require("../models/agent.model");

module.exports = async function seedAgent() {
  const email = "agent1@test.com";
  const exists = await Agent.findOne({ where: { email } });
  if (exists) return;

  const passwordHash = await bcrypt.hash("123456", 10);
  await Agent.create({
    name: "Agent One",
    email,
    passwordHash,
    isActive: true,
  });

  console.log("✅ Seeded agent:", email, "password: 123456");
};
