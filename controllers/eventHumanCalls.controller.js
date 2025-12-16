const { Op } = require("sequelize");
const Event = require("../models/event.model");
const Guest = require("../models/guest.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");

function parseIntSafe(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

exports.getEventHumanCalls = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    const status = (req.query.status || "").trim(); // "pending" | "success" | "failed"
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const limit = Math.min(
      200,
      Math.max(10, parseIntSafe(req.query.limit, 50))
    );
    const offset = (page - 1) * limit;

    // ensure event belongs to user
    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const where = { eventId: Number(eventId) };

    if (status && ["pending", "success", "failed"].includes(status)) {
      where.status = status;
    }

    if (from || to) {
      where.scheduledAt = {};
      if (from) where.scheduledAt[Op.gte] = from;
      if (to) where.scheduledAt[Op.lte] = to;
    }

    const { rows, count } = await HumanCallAutomation.findAndCountAll({
      where,
      order: [
        ["scheduledAt", "ASC"],
        ["id", "ASC"],
      ],
      limit,
      offset,
      attributes: [
        "id",
        "guestNumber",
        "rsvpToken",
        "status",
        "scheduledAt",
        "round",
        "billingPaymentId",
        "templateId",
        "createdAt",
      ],
    });

    // map guest name/status by token (since no FK relation)
    const tokens = [...new Set(rows.map((r) => r.rsvpToken).filter(Boolean))];

    const guests = tokens.length
      ? await Guest.findAll({
          where: { eventId: Number(eventId), rsvpToken: { [Op.in]: tokens } },
          attributes: ["id", "name", "phone", "status", "rsvpToken"],
        })
      : [];

    const guestMap = new Map(guests.map((g) => [g.rsvpToken, g]));

    const data = rows.map((t) => {
      const g = guestMap.get(t.rsvpToken);
      return {
        id: t.id,
        status: t.status, // pending | success | failed
        scheduledAt: t.scheduledAt,
        round: t.round,
        billingPaymentId: t.billingPaymentId,
        templateId: t.templateId,

        guest: {
          name: g?.name || null,
          phone: g?.phone || t.guestNumber,
          guestStatus: g?.status || null, // pending/confirmed/hesitate/cancel
          rsvpToken: t.rsvpToken,
        },
      };
    });

    return res.json({
      event: {
        id: event.id,
        name: event.name,
        eventDate: event.eventDate,
        location: event.location,
      },
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
      humanCalls: data,
    });
  } catch (err) {
    console.error("getEventHumanCalls error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getEventHumanCallsSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.params;

    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    const [pending, success, failed, total] = await Promise.all([
      HumanCallAutomation.count({ where: { eventId, status: "pending" } }),
      HumanCallAutomation.count({ where: { eventId, status: "success" } }),
      HumanCallAutomation.count({ where: { eventId, status: "failed" } }),
      HumanCallAutomation.count({ where: { eventId } }),
    ]);

    return res.json({
      eventId: Number(eventId),
      total,
      pending,
      success,
      failed,
    });
  } catch (err) {
    console.error("getEventHumanCallsSummary error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
