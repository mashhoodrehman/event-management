// middleware/adminAuth.js
require("dotenv").config();
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

const adminAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded || !decoded.adminId) {
      return res.status(403).json({ error: "Admin access only" });
    }

    req.admin = {
      id: decoded.adminId,
      email: decoded.email,
    };

    next();
  } catch (err) {
    console.error("adminAuth error:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = adminAuth;
