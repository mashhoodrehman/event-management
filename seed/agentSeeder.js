const bcrypt = require("bcrypt");
const Agent = require("../models/agent.model");

module.exports = async function seedAgent() {
  const exists = await Agent.findOne({ where: { email: "agent@test.com" } });
  if (exists) return;

  await Agent.create({
    name: "Test Agent",
    email: "agent@test.com",
    passwordHash: await bcrypt.hash("123456", 10),
  });

  console.log("✅ Agent seeded: agent@test.com / 123456");
};
