require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sequelize = require("./config/database");
const authRoutes = require("./routes/auth.routes");

const app = express();

// ✅ Enable CORS (important!)
app.use(
  cors({
    origin: "http://localhost:8080", // your React app URL
    credentials: true, // allow cookies/authorization headers if needed
  })
);

// Middleware
app.use(bodyParser.json());

// Routes
app.use("/api/auth", authRoutes);

// Database Sync
sequelize
  .sync()
  .then(() => console.log("✅ MySQL Database Connected"))
  .catch((err) => console.error("❌ DB Connection Error:", err));

// Start server
const PORT = process.env.PORT || 5000; // use 5000 to match your frontend config
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
