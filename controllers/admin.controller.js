// controllers/admin.controller.js
require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");

const AdminUser = require("../models/adminUser.model");
const User = require("../models/user.model");
const Event = require("../models/event.model");
const Payment = require("../models/payment.model");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// ---------- ADMIN LOGIN (uses AdminUser table) ----------
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const admin = await AdminUser.findOne({ where: { email } });
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      message: "Admin login successful",
      token,
    });
  } catch (err) {
    console.error("adminLogin error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ---------- GET ALL USERS for admin dashboard ----------
/**
 * GET /api/admin/users
 * Return list of all client users with:
 *  - name
 *  - email
 *  - accountType
 *  - setupFeePaid (true/false)
 *  - joiningDate (createdAt)
 */
const getAllUsersWithSetupFee = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "name", "email", "type", "createdAt"],
      include: [
        {
          model: Event,
          attributes: ["id"],
          include: [
            {
              // Event.hasOne(Payment) with no alias -> use plain model
              model: Payment,
              attributes: ["id", "type", "status"],
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const result = users.map((user) => {
      const events = user.Events || [];

      let setupFeePaid = false;

      for (const ev of events) {
        // hasOne -> single object: ev.Payment (NOT ev.Payments)
        const payment = ev.Payment;

        if (
          payment &&
          payment.type === "setup_fee" &&
          payment.status === "initiated" // or "succeeded" if you prefer
        ) {
          console.log("===== setup fee found =====");
          setupFeePaid = true;
          break;
        }
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        accountType: user.type,
        setupFeePaid,
        joiningDate: user.createdAt,
      };
    });

    return res.status(200).json({ users: result });
  } catch (err) {
    console.error("getAllUsersWithSetupFee error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

// ---------- ADMIN DASHBOARD STATS ----------
/**
 * GET /api/admin/stats
 * Returns:
 * {
 *   totalUsers,
 *   totalEvents,
 *   activeEvents,
 *   monthlyIncomeCents,
 *   monthlyIncomeILS,
 *   totalPayments,
 *   failedPayments
 * }
 */
const getAdminDashboardStats = async (req, res) => {
  try {
    // Total registered client users
    const totalUsers = await User.count();

    // Total events
    const totalEvents = await Event.count();

    // Active events = events with eventDate today or in future
    const now = new Date();
    const activeEvents = await Event.count({
      where: {
        eventDate: {
          [Op.gte]: now,
        },
      },
    });

    // Monthly income = sum of succeeded payments for CURRENT month
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyIncomeCentsRaw = await Payment.sum("amount", {
      where: {
        status: "succeeded",
        createdAt: {
          [Op.gte]: monthStart,
          [Op.lte]: today,
        },
      },
    });

    const monthlyIncomeCents = monthlyIncomeCentsRaw || 0;
    const monthlyIncomeILS = Number((monthlyIncomeCents / 100).toFixed(2));

    // Payments stats
    const totalPayments = await Payment.count();
    const failedPayments = await Payment.count({
      where: {
        status: "failed",
      },
    });

    return res.status(200).json({
      totalUsers,
      totalEvents,
      activeEvents,
      monthlyIncomeCents,
      monthlyIncomeILS,
      totalPayments,
      failedPayments,
      monthStart, // optional: useful for frontend
      monthEnd: today,
    });
  } catch (err) {
    console.error("getAdminDashboardStats error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
const getLastMonthRevenue = async (req, res) => {
  try {
    const today = new Date();

    // Previous calendar month range:
    // e.g. if today = 2025-12-11 -> from 2025-11-01 (inclusive) to 2025-12-01 (exclusive)
    const monthEnd = new Date(today.getFullYear(), today.getMonth(), 1); // first day of THIS month
    const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1); // first day of LAST month

    const baseWhere = {
      status: "succeeded",
      createdAt: {
        [Op.gte]: monthStart,
        [Op.lt]: monthEnd,
      },
    };

    const [setupFee, smsFee, whatsappFee, aiCallFee, humanCallFee] =
      await Promise.all([
        Payment.sum("amount", {
          where: { ...baseWhere, type: "setup_fee" },
        }),
        Payment.sum("amount", {
          where: { ...baseWhere, type: "sms_fee" },
        }),
        Payment.sum("amount", {
          where: { ...baseWhere, type: "whatsapp_fee" },
        }),
        Payment.sum("amount", {
          where: { ...baseWhere, type: "ai_call_fee" },
        }),
        Payment.sum("amount", {
          where: { ...baseWhere, type: "human_call_fee" },
        }),
      ]);

    const safe = (v) => (v == null ? 0 : v);

    const setupFeeCents = safe(setupFee);
    const smsFeeCents = safe(smsFee);
    const whatsappFeeCents = safe(whatsappFee);
    const aiCallFeeCents = safe(aiCallFee);
    const humanCallFeeCents = safe(humanCallFee);

    const automationFeesCents =
      smsFeeCents + whatsappFeeCents + aiCallFeeCents + humanCallFeeCents;
    const grandTotalCents = automationFeesCents + setupFeeCents;

    return res.status(200).json({
      period: {
        from: monthStart, // inclusive
        to: monthEnd, // exclusive
      },
      currency: "ils",
      breakdown: {
        setupFeeCents,
        smsFeeCents,
        whatsappFeeCents,
        aiCallFeeCents,
        humanCallFeeCents,
      },
      totals: {
        automationFeesCents,
        grandTotalCents,
        automationFeesILS: Number((automationFeesCents / 100).toFixed(2)),
        grandTotalILS: Number((grandTotalCents / 100).toFixed(2)),
      },
    });
  } catch (err) {
    console.error("getLastMonthRevenue error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
const getRecentActivity = async (req, res) => {
  try {
    // Fetch latest 10 of each, then we'll merge + sort + slice top 5
    const [users, events, payments] = await Promise.all([
      User.findAll({
        attributes: ["id", "name", "email", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
      Event.findAll({
        attributes: ["id", "name", "eventDate", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
      Payment.findAll({
        attributes: ["id", "type", "amount", "status", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
    ]);

    const userActivities = users.map((u) => ({
      type: "user_signup",
      createdAt: u.createdAt,
      timeAgo: formatTimeAgo(u.createdAt),
      title: `New user signed up`,
      description: `${u.name} (${u.email})`,
      meta: {
        userId: u.id,
      },
    }));

    const eventActivities = events.map((e) => ({
      type: "event_created",
      createdAt: e.createdAt,
      timeAgo: formatTimeAgo(e.createdAt),
      title: `New event created`,
      description: e.name || `Event #${e.id}`,
      meta: {
        eventId: e.id,
        eventDate: e.eventDate,
      },
    }));

    const paymentActivities = payments.map((p) => {
      const amountILS = Number((p.amount / 100).toFixed(2));
      const typeLabelMap = {
        setup_fee: "Setup fee",
        sms_fee: "SMS fee",
        whatsapp_fee: "WhatsApp fee",
        ai_call_fee: "AI call fee",
        human_call_fee: "Human call fee",
      };

      const typeLabel = typeLabelMap[p.type] || p.type;

      return {
        type: "payment",
        createdAt: p.createdAt,
        timeAgo: formatTimeAgo(p.createdAt),
        title: `${typeLabel} payment`,
        description: `₪${amountILS} - ${p.status}`,
        meta: {
          paymentId: p.id,
          paymentType: p.type,
          amountCents: p.amount,
          status: p.status,
        },
      };
    });

    // Merge & sort all by createdAt desc
    const allActivities = [
      ...userActivities,
      ...eventActivities,
      ...paymentActivities,
    ];

    allActivities.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const top5 = allActivities.slice(0, 5);

    return res.status(200).json({ activities: top5 });
  } catch (err) {
    console.error("getRecentActivity error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};
const getAllPaymentsWithUser = async (req, res) => {
  try {
    const payments = await Payment.findAll({
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Event,
          attributes: ["id", "name"],
          include: [
            {
              model: User,
              attributes: ["id", "name", "email"],
            },
          ],
        },
      ],
    });

    const result = payments.map((p) => {
      const event = p.Event;
      const user = event ? event.User : null;

      return {
        id: p.id,
        eventId: event ? event.id : null,
        eventName: event ? event.name : null,
        userId: user ? user.id : null,
        userName: user ? user.name : null,
        userEmail: user ? user.email : null,
        amountCents: p.amount,
        amountILS:
          p.amount != null ? Number((p.amount / 100).toFixed(2)) : null,
        currency: p.currency,
        type: p.type, // "setup_fee" | "sms_fee" | ...
        status: p.status, // "succeeded" | "failed" | ...
        paymentIntentId: p.paymentIntentId,
        createdAt: p.createdAt,
      };
    });

    return res.status(200).json({ payments: result });
  } catch (err) {
    console.error("getAllPaymentsWithUser error:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  adminLogin,
  getAllUsersWithSetupFee,
  getAdminDashboardStats,
  getLastMonthRevenue,
  getRecentActivity,
  getAllPaymentsWithUser,
};
