require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sequelize = require("./config/database");
const cardcomRoutes = require("./routes/cardcom.routes");
const authRoutes = require("./routes/auth.routes");
const seedEventTypes = require("./seed/eventTypeSeeder");
const eventTypeRoutes = require("./routes/eventTypes.routes");
const eventRoutes = require("./routes/event.routes");
const guestRoutes = require("./routes/guest.routes");
const automationRoutes = require("./routes/automation.routes");
const reminderRoutes = require("./routes/reminder.routes");
const seedAdminUser = require("./seed/adminSeeder");
const adminRoutes = require("./routes/admin.routes");
const seedServicePricing = require("./seed/servicePricingSeeder");
const servicePricingRoutes = require("./routes/servicePricing.routes");
const agentHumanCallsRoutes = require("./routes/agentHumanCalls.routes");
const agentAuthRoutes = require("./routes/agentAuth.routes");
const seedAgent = require("./seed/agentSeeder");
const aiCallWebhookRoutes = require("./routes/aiCallWebhook.routes");
const eventHumanCallsRoutes = require("./routes/eventHumanCalls.routes");
const deviceRoutes = require("./routes/device.routes");
const matchingRoutes = require("./routes/matching.routes");

const path = require("path");

const app = express();

// ✅ Enable CORS (important!)
app.use(
  cors({
    origin: true, // allows any origin and reflects it back to support credentials: true
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
  })
);


// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api/cardcom", cardcomRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/event-types", eventTypeRoutes);
app.use("/api/event", eventRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/automation", automationRoutes);
app.use("/api/guest", guestRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/admin/services", servicePricingRoutes);
app.use("/api/agent", agentHumanCallsRoutes);
app.use("/api/admin", adminRoutes);

app.use("/api/agent", agentAuthRoutes);

app.use("/api/webhooks", aiCallWebhookRoutes);
app.use("/api/event", eventHumanCallsRoutes);
app.use("/api/whatsapp", require("./routes/whatsapp.routes"));
app.use("/api/devices", deviceRoutes);
app.use("/api/matching", matchingRoutes);

require("./workers/automationWorker");
require("./workers/emailWorker");

require("./cron/backfillCron");

// Database Sync
sequelize
  .sync({ alter: true })
  .then(async ({ }) => {
    console.log("✅ MySQL Database Connected & Synced");

    // Run seeder (only if needed)
    await seedAgent();
    await seedAdminUser();
    await seedEventTypes();
    await seedServicePricing(); // ✅ ADD THIS
  })
  .catch((err) => console.error("❌ DB Connection Error:", err));

// Start server
const PORT = process.env.PORT || 5000; // use 5000 to match your frontend config
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
