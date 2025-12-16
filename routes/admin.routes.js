// routes/admin.routes.js
const express = require("express");
const router = express.Router();

const {
  adminLogin,
  getAllUsersWithSetupFee,
  getAdminDashboardStats,
  getLastMonthRevenue,
  getRecentActivity,
  getAllPaymentsWithUser,
} = require("../controllers/admin.controller");

const adminAuth = require("../middleware/adminAuth");

// POST /api/admin/login
router.post("/login", adminLogin);

// GET /api/admin/users  (admin-only)
router.get("/users", adminAuth, getAllUsersWithSetupFee);

router.get("/stats", adminAuth, getAdminDashboardStats);
router.get("/revenue/last-month", adminAuth, getLastMonthRevenue);
router.get("/recent-activity", adminAuth, getRecentActivity);
router.get("/payments", adminAuth, getAllPaymentsWithUser);

module.exports = router;
