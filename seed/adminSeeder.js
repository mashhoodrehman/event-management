// seed/adminSeeder.js
const bcrypt = require("bcrypt");
const AdminUser = require("../models/adminUser.model");

async function seedAdminUser() {
  const adminEmail = "admin@example.com"; // change in prod
  const adminPassword = "Admin123!"; // change in prod

  const exists = await AdminUser.findOne({ where: { email: adminEmail } });
  if (exists) {
    console.log("⚠️ Admin user already exists, skipping admin seeder");
    return;
  }

  const hash = await bcrypt.hash(adminPassword, 10);

  await AdminUser.create({
    name: "System Admin",
    email: adminEmail,
    password: hash,
  });

  console.log("✅ Admin user created:");
  console.log(`  Email: ${adminEmail}`);
  console.log(`  Password: ${adminPassword}`);
}

module.exports = seedAdminUser;
