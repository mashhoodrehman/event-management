const { Op } = require("sequelize");

const Guest = require("../models/guest.model");
const Event = require("../models/event.model");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const { formatTimeAgo } = require("../utils/timeAgo");

/**
 * Update guest RSVP status
 * @param {string} token - unique RSVP token
 * @param {string} status - confirmed / hesitate / cancel
 */
const updateRSVPStatus = async (req, res) => {
  try {
    const { token, status } = req.body;

    if (!token || !status) {
      return res.status(400).json({ message: "Token and status are required" });
    }

    // Find guest by token
    const guest = await Guest.findOne({ where: { rsvpToken: token } });
    if (!guest) {
      return res.status(404).json({ message: "Invalid RSVP token" });
    }

    // Update status
    guest.status = status;
    await guest.save();

    res.json({ success: true, status: guest.status });
  } catch (err) {
    console.error("RSVP Update Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getGuestDetails = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "RSVP token is required" });
    }

    // Find guest by token and include the associated event
    const guest = await Guest.findOne({
      where: { rsvpToken: token },
      include: [
        {
          model: Event,
          attributes: [
            "id",
            "name",
            "location",
            "locationName",
            "locationLat",
            "locationLng",
            "eventDate",
            "description",
          ],
        },
      ],
    });

    if (!guest) {
      return res.status(404).json({ message: "Invalid RSVP token" });
    }

    // Return guest + event info
    res.json({
      guest: {
        id: guest.id,
        name: guest.name,
        phone: guest.phone,
        status: guest.status,
      },
      event: guest.Event
        ? {
            id: guest.Event.id,
            name: guest.Event.name,
            location: guest.Event.location,
            startTime: guest.Event.eventDate,
            locationName: guest.Event.locationName,
            locationLat: guest.Event.locationLat,
            locationLng: guest.Event.locationLng,
            description: guest.Event.description,
          }
        : null,
    });
  } catch (err) {
    console.error("getGuestDetails error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getGuestsByFilters = async (req, res) => {
  try {
    const { eventId, status } = req.query;
    const userId = req.user.id; // From auth middleware

    if (!eventId) return res.status(400).json({ error: "eventId is required" });

    // Verify event belongs to user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event)
      return res.status(404).json({ error: "Event not found or unauthorized" });

    // Build filter
    const whereCondition = { eventId };

    if (status) {
      // status can be single or comma separated, e.g., "confirmed,hesitate"
      const statusArray = status.split(","); // ["confirmed", "hesitate"]
      whereCondition.status = { [Op.in]: statusArray };
    }

    // Fetch guests
    const guests = await Guest.findAll({
      where: whereCondition,
      order: [["id", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      total: guests.length,
      data: guests,
    });
  } catch (error) {
    console.error("Error fetching guests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getRecentActivity = async (req, res) => {
  try {
    const { eventId } = req.query;
    const userId = req.user.id; // from auth middleware

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // Ensure the event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // Find latest 5 guests whose status is NOT 'pending'
    const guests = await Guest.findAll({
      where: {
        eventId,
        status: { [Op.ne]: "pending" },
      },
      order: [["updatedAt", "DESC"]],
      limit: 5,
    });

    const activities = guests.map((guest) => ({
      name: guest.name,
      status: guest.status,
      timeAgo: formatTimeAgo(guest.updatedAt),
      // you can also return raw time if you want:
      // updatedAt: guest.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getGuestStats = async (req, res) => {
  try {
    const { eventId } = req.query;
    const userId = req.user.id; // from auth middleware

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // ✅ Verify that event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // ✅ Count guests per status
    const [totalGuests, confirmed, cancel, hesitate, pending] =
      await Promise.all([
        Guest.count({ where: { eventId } }),
        Guest.count({ where: { eventId, status: "confirmed" } }),
        Guest.count({ where: { eventId, status: "cancel" } }),
        Guest.count({ where: { eventId, status: "hesitate" } }),
        Guest.count({ where: { eventId, status: "pending" } }),
      ]);

    const waiting = pending + hesitate;
    const responded = confirmed + cancel + hesitate;

    const responseRatePercent =
      totalGuests > 0
        ? Number(((responded / totalGuests) * 100).toFixed(1))
        : 0;

    return res.status(200).json({
      eventId: Number(eventId),
      totalGuests,
      statuses: {
        pending,
        confirmed,
        hesitate,
        cancel,
        waiting, // pending + hesitate
      },
      responded,
      responseRatePercent,
    });
  } catch (error) {
    console.error("getGuestStats error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getPendingFollowupGuests = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    // Ensure event belongs to this user
    const event = await Event.findOne({
      where: { id: eventId, userId },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found or unauthorized" });
    }

    // 1) Load guests: pending / hesitate / cancel
    const guests = await Guest.findAll({
      where: {
        eventId,
        status: {
          [Op.in]: ["pending", "hesitate", "cancel"],
        },
      },
      attributes: ["id", "name", "phone", "status", "rsvpToken"],
      order: [["id", "ASC"]],
    });

    if (!guests.length) {
      return res.json({ guests: [] });
    }

    const tokens = guests.map((g) => g.rsvpToken).filter((t) => !!t);

    if (!tokens.length) {
      return res.json({
        guests: guests.map((g) => ({
          id: g.id,
          name: g.name,
          phone: g.phone,
          status: g.status,
          attempts: [],
        })),
      });
    }

    // 2) Load all automation tasks by rsvpToken + eventId
    const [smsTasks, whatsappTasks, aiTasks, humanTasks] = await Promise.all([
      SMSAutomation.findAll({
        where: {
          eventId,
          rsvpToken: { [Op.in]: tokens },
        },
        attributes: ["id", "rsvpToken", "scheduledAt", "status"],
        order: [["scheduledAt", "ASC"]],
      }),
      WhatsAppAutomation.findAll({
        where: {
          eventId,
          rsvpToken: { [Op.in]: tokens },
        },
        attributes: ["id", "rsvpToken", "scheduledAt", "status"],
        order: [["scheduledAt", "ASC"]],
      }),
      AICallAutomation.findAll({
        where: {
          eventId,
          rsvpToken: { [Op.in]: tokens },
        },
        attributes: ["id", "rsvpToken", "scheduledAt", "status"],
        order: [["scheduledAt", "ASC"]],
      }),
      HumanCallAutomation.findAll({
        where: {
          eventId,
          rsvpToken: { [Op.in]: tokens },
        },
        attributes: ["id", "rsvpToken", "scheduledAt", "status"],
        order: [["scheduledAt", "ASC"]],
      }),
    ]);

    // 3) Build maps
    const guestByToken = new Map(
      guests.filter((g) => !!g.rsvpToken).map((g) => [g.rsvpToken, g])
    );

    const attemptsByGuestId = new Map();
    for (const g of guests) {
      attemptsByGuestId.set(g.id, []);
    }

    const now = new Date();

    const pushAttempt = (task, channel) => {
      const guest = guestByToken.get(task.rsvpToken);
      if (!guest) return;

      const guestAttempts = attemptsByGuestId.get(guest.id);
      if (!guestAttempts) return;

      const scheduledAt =
        task.scheduledAt instanceof Date
          ? task.scheduledAt
          : new Date(task.scheduledAt);

      const isFuture = scheduledAt > now && task.status === "pending";

      // guestResponded = guest.status != "pending"
      const guestResponded = guest.status !== "pending";

      guestAttempts.push({
        id: task.id,
        channel, // "sms" | "whatsapp" | "ai_call" | "human_call"
        scheduledAt: scheduledAt.toISOString(),
        executedAt: null, // if you later add executedAt field in models, fill here
        status: task.status, // "pending" | "success" | "failed"
        guestResponded,
        guestResponseText: null, // if you later store reason/text, fill here
      });
    };

    smsTasks.forEach((t) => pushAttempt(t, "sms"));
    whatsappTasks.forEach((t) => pushAttempt(t, "whatsapp"));
    aiTasks.forEach((t) => pushAttempt(t, "ai_call"));
    humanTasks.forEach((t) => pushAttempt(t, "human_call"));

    // 4) Build final response
    const responseGuests = guests.map((g) => {
      const attempts = attemptsByGuestId.get(g.id) || [];
      // sort by scheduledAt just in case
      attempts.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );

      return {
        id: g.id,
        name: g.name,
        phone: g.phone,
        status: g.status, // "pending" | "hesitate" | "cancel"
        attempts,
      };
    });

    return res.json({ guests: responseGuests });
  } catch (err) {
    console.error("getPendingFollowupGuests error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Server error while fetching guests" });
  }
};

module.exports = {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
  getRecentActivity,
  getGuestStats,
  getPendingFollowupGuests,
};
