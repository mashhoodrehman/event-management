require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sequelize = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const seedEventTypes = require("./seed/eventTypeSeeder");
const eventTypeRoutes = require("./routes/eventTypes.routes");
const eventRoutes = require("./routes/event.routes");
const stripeRoutes = require("./routes/stripe.routes");
const guestRoutes = require("./routes/guest.routes");

const path = require("path");

const app = express();

// ✅ Enable CORS (important!)
app.use(
  cors({
    origin: [
      "http://localhost:8080",
      "http://app-frontend-react.cvvm9olplp-gjy3m9eyd48q.p.temp-site.link",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true, // allow cookies/authorization headers if needed
  })
);
app.use("/api/stripe", stripeRoutes);

// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/event-types", eventTypeRoutes);
app.use("/api/event", eventRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/guest", guestRoutes);

require("./workers/automationWorker");
// require("./cron/automationRunner");

// Database Sync
sequelize
  .sync()
  .then(async ({}) => {
    console.log("✅ MySQL Database Connected & Synced");

    // Run seeder (only if needed)
    await seedEventTypes();
  })
  .catch((err) => console.error("❌ DB Connection Error:", err));

// Start server
const PORT = process.env.PORT || 5000; // use 5000 to match your frontend config
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
