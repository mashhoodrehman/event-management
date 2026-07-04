const { Op } = require("sequelize");
const crypto = require("crypto");
const Guest = require("../models/guest.model");
const Event = require("../models/event.model");
const SMSAutomation = require("../models/smsAutomation.model");
const WhatsAppAutomation = require("../models/whatsAppAutomation.model");
const AICallAutomation = require("../models/aICallAutomation.model");
const HumanCallAutomation = require("../models/humanCallAutomation.model");
const { formatTimeAgo } = require("../utils/timeAgo");
const ActivityService = require("../services/activityService");

/**
 * Update guest RSVP status
 * @param {string} token - unique RSVP token
 * @param {string} status - confirmed / hesitate / cancel
 */

// 🔹 SAME normalization you already use
const normalizePhone = (phone) => {
  if (!phone) return null;

  phone = String(phone)
    .trim()
    .replace(/[^\d+]/g, "");

  // Pakistan
  if (/^0?3\d{9}$/.test(phone)) {
    if (phone.startsWith("0")) phone = phone.slice(1);
    return "+92" + phone;
  }
  if (/^\+923\d{9}$/.test(phone)) return phone;

  // Israel
  if (/^0?5\d{8}$/.test(phone)) {
    if (phone.startsWith("0")) phone = phone.slice(1);
    return "+972" + phone;
  }
  if (/^\+9725\d{8}$/.test(phone)) return phone;

  return null;
};

const addGuestManual = async (req, res) => {
  try {
    const { eventId, name, phone } = req.body;

    if (!eventId)
      return res
        .status(400)
        .json({ success: false, message: "eventId required" });

    if (!name?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Name is required" });

    const event = await Event.findByPk(eventId);
    if (!event)
      return res
        .status(404)
        .json({ success: false, message: "Event not found" });

    let normalizedPhone = null;
    if (phone && phone.trim()) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: "Invalid phone number" });
      }

      // Duplicate check (per event) only if phone exists
      const exists = await Guest.findOne({
        where: { eventId, phone: normalizedPhone },
      });

      if (exists) {
        return res.status(409).json({
          success: false,
          message: "Guest with this phone already exists",
        });
      }
    }

    const guest = await Guest.create({
      eventId,
      name: name.trim(),
      phone: normalizedPhone,
      status: "pending", // 🔒 backend controlled
      accompanyingGuests: 0,
      rsvpToken: crypto.randomBytes(16).toString("hex"),
    });

    res.status(201).json({ success: true, data: guest });
  } catch (err) {
    console.error("addGuestManual error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
const updateRSVPStatus = async (req, res) => {
  try {
    const { token, status, attendeesCount } = req.body;

    console.log(token, status, attendeesCount, "mmmmmmm77777777");

    if (!token || !status) {
      return res.status(400).json({ message: "Token and status are required" });
    }

    const allowed = ["confirmed", "hesitate", "cancel"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Find guest by token
    const guest = await Guest.findOne({ where: { rsvpToken: token } });
    if (!guest) {
      return res.status(404).json({ message: "Invalid RSVP token" });
    }

    // ✅ Update status
    guest.status = status;

    // ✅ Track response source (via)
    const via = req.body.via || req.query.via;
    if (via) {
      guest.respondedVia = via;
    }

    // ✅ Update peopleCount ONLY when confirmed
    if (status === "confirmed") {
      const incoming = attendeesCount; // accept both
      if (incoming !== undefined) {
        const parsed = parseInt(incoming, 10);

        if (Number.isNaN(parsed) || parsed < 1 || parsed > 50) {
          return res.status(400).json({
            message: "peopleCount must be a number between 1 and 50",
          });
        }
        console.log(parsed, "===0099");
        guest.peopleCount = parsed;
      } else {
        // if not sent, keep existing value or ensure default
        guest.peopleCount = guest.peopleCount || 1;
      }
    } else {
      // Optional: If not confirmed, you can reset to 1
      guest.peopleCount = 1;
    }

    await guest.save();

    return res.json({
      success: true,
      status: guest.status,
      peopleCount: guest.peopleCount,
    });
  } catch (err) {
    console.error("RSVP Update Error:", err);
    return res.status(500).json({ message: "Server error" });
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
            "invitationFile",
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
          invitationFile: guest.Event.invitationFile,
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

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

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

    // Fetch guests with pagination
    const { count, rows: guests } = await Guest.findAndCountAll({
      where: whereCondition,
      order: [["id", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      total: count,
      page,
      limit,
      totalPages,
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

    // Get last automation run (SMS, WhatsApp, AI Call, or Human Call)
    const [
      latestSMS,
      latestWhatsApp,
      latestAICall,
      latestHumanCall,
    ] = await Promise.all([
      SMSAutomation.findAll({
        where: { eventId, status: "success" },
        order: [["updatedAt", "DESC"]],
        limit: 100,
      }),
      WhatsAppAutomation.findAll({
        where: { eventId, status: "success" },
        order: [["updatedAt", "DESC"]],
        limit: 100,
      }),
      AICallAutomation.findAll({
        where: { eventId, status: "success" },
        order: [["updatedAt", "DESC"]],
        limit: 100,
      }),
      HumanCallAutomation.findAll({
        where: { eventId, status: "success" },
        order: [["updatedAt", "DESC"]],
        limit: 100,
      }),
    ]);

    // Find the most recent automation run
    let lastAutomationRun = null;

    const allAutomations = [
      ...latestSMS.map((a) => ({ ...a.dataValues, type: "SMS" })),
      ...latestWhatsApp.map((a) => ({ ...a.dataValues, type: "WhatsApp" })),
      ...latestAICall.map((a) => ({ ...a.dataValues, type: "AI Call" })),
      ...latestHumanCall.map((a) => ({ ...a.dataValues, type: "Human Call" })),
    ];

    if (allAutomations.length > 0) {
      // Sort by scheduledAt to get the most recent automation batch
      allAutomations.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
      const mostRecent = allAutomations[0];

      // Count how many of the same type were scheduled in the same batch (same scheduledAt time)

      const count = allAutomations.filter(
        (a) =>
          a.type === mostRecent.type &&
          a.isTriggered &&
          Math.abs(new Date(a.scheduledAt).getTime() - new Date(mostRecent.scheduledAt).getTime()) < 30 * 60 * 1000
      ).length;

      lastAutomationRun = {
        type: mostRecent.type,
        message: `We sent ${count} ${mostRecent.type.toLowerCase()} ${count === 1 ? "message" : "messages"}`,
        timeAgo: formatTimeAgo(mostRecent.scheduledAt),
        scheduledAt: mostRecent.scheduledAt,
      };
    }

    return res.status(200).json({
      success: true,
      data: activities,
      lastAutomationRun,
    });
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getWeeklyActivity = async (req, res) => {
  try {
    const { eventId } = req.query;
    const data = await ActivityService.getWeeklyActivity(eventId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    const [
      totalGuests,
      confirmed,
      cancel,
      hesitate,
      pending,
      totalPeople,
      totalConfirmedPeople,
    ] = await Promise.all([
      Guest.count({ where: { eventId } }),
      Guest.count({ where: { eventId, status: "confirmed" } }),
      Guest.count({ where: { eventId, status: "cancel" } }),
      Guest.count({ where: { eventId, status: "hesitate" } }),
      Guest.count({ where: { eventId, status: "pending" } }),
      Guest.sum("peopleCount", { where: { eventId } }),
      Guest.sum("peopleCount", { where: { eventId, status: "confirmed" } }),
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
      totalPeople: totalPeople || 0,
      totalConfirmedPeople: totalConfirmedPeople || 0,
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
      attributes: ["id", "name", "phone", "status", "rsvpToken", "respondedVia"],
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

/**
 * GET /api/guest/confirmed-with-history
 * Returns confirmed + hesitate guests for an event,
 * each with the full list of communication attempts across all channels.
 * Also returns a summary of total people count (peopleCount sum).
 */
const getConfirmedGuestsWithHistory = async (req, res) => {
  try {
    const { eventId } = req.query;
    const userId = req.user.id;

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    if (!eventId) return res.status(400).json({ error: "eventId is required" });

    const event = await Event.findOne({ where: { id: eventId, userId } });
    if (!event) return res.status(404).json({ error: "Event not found or unauthorized" });

    // 1) Fetch confirmed + hesitate guests (paginated)
    const { count, rows: guests } = await Guest.findAndCountAll({
      where: { eventId, status: { [Op.in]: ["confirmed", "hesitate"] } },
      order: [["updatedAt", "DESC"]],
      limit,
      offset,
    });

    if (!guests.length) {
      return res.json({
        success: true,
        total: count,
        page, limit,
        totalPages: Math.ceil(count / limit),
        totalPeopleCount: 0,
        data: [],
      });
    }

    // Total people count across ALL confirmed guests (not just this page)
    const allConfirmed = await Guest.findAll({
      where: { eventId, status: { [Op.in]: ["confirmed", "hesitate"] } },
      attributes: ["peopleCount"],
    });
    const totalPeopleCount = allConfirmed.reduce((sum, g) => sum + (g.peopleCount || 1), 0);

    const tokens = guests.map((g) => g.rsvpToken).filter(Boolean);

    // 2) Load all automation tasks for these guests
    const [smsTasks, whatsappTasks, aiTasks, humanTasks] = await Promise.all([
      SMSAutomation.findAll({
        where: { eventId, rsvpToken: { [Op.in]: tokens } },
        attributes: ["id", "rsvpToken", "scheduledAt", "status", "round"],
        order: [["scheduledAt", "ASC"]],
      }),
      WhatsAppAutomation.findAll({
        where: { eventId, rsvpToken: { [Op.in]: tokens } },
        attributes: ["id", "rsvpToken", "scheduledAt", "status", "round"],
        order: [["scheduledAt", "ASC"]],
      }),
      AICallAutomation.findAll({
        where: { eventId, rsvpToken: { [Op.in]: tokens } },
        attributes: ["id", "rsvpToken", "scheduledAt", "status", "round"],
        order: [["scheduledAt", "ASC"]],
      }),
      HumanCallAutomation.findAll({
        where: { eventId, rsvpToken: { [Op.in]: tokens } },
        attributes: ["id", "rsvpToken", "scheduledAt", "status", "round", "callResult", "agentNote"],
        order: [["scheduledAt", "ASC"]],
      }),
    ]);

    // 3) Build token → attempts map
    const attemptsByToken = new Map();
    guests.forEach((g) => attemptsByToken.set(g.rsvpToken, []));

    const pushAttempt = (task, channel) => {
      const arr = attemptsByToken.get(task.rsvpToken);
      if (!arr) return;
      arr.push({
        id: task.id,
        channel,
        scheduledAt: task.scheduledAt,
        status: task.status,   // pending | success | failed
        round: task.round || 1,
        // human-call extras
        callResult: task.callResult || null,
        agentNote: task.agentNote || null,
      });
    };

    smsTasks.forEach((t) => pushAttempt(t, "sms"));
    whatsappTasks.forEach((t) => pushAttempt(t, "whatsapp"));
    aiTasks.forEach((t) => pushAttempt(t, "ai_call"));
    humanTasks.forEach((t) => pushAttempt(t, "human_call"));

    // 4) Find which channel the guest actually responded on (latest success before status changed)
    const responseChannelByToken = new Map();
    guests.forEach((g) => {
      const attempts = attemptsByToken.get(g.rsvpToken) || [];
      // Sort by scheduled time
      attempts.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

      // The channel that got a "success" status is where the guest responded
      const respondedAttempt = [...attempts].reverse().find((a) => a.status === "success");
      responseChannelByToken.set(
        g.rsvpToken,
        respondedAttempt ? respondedAttempt.channel : null
      );
    });

    // 5) Build final response
    const data = guests.map((g) => {
      const attempts = (attemptsByToken.get(g.rsvpToken) || []).sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      );

      // Channels used (unique, ordered)
      const channelsUsed = [...new Set(attempts.map((a) => a.channel))];

      return {
        id: g.id,
        name: g.name,
        phone: g.phone,
        status: g.status,
        peopleCount: g.peopleCount || 1,
        respondedVia: g.respondedVia,
        updatedAt: g.updatedAt,
        responseChannel: responseChannelByToken.get(g.rsvpToken),  // channel where guest replied
        channelsUsed,                                               // all channels contacted
        communicationHistory: attempts,                             // full timeline
      };
    });

    return res.json({
      success: true,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      totalPeopleCount,
      data,
    });
  } catch (err) {
    console.error("getConfirmedGuestsWithHistory error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
};

module.exports = {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
  getRecentActivity,
  getGuestStats,
  getPendingFollowupGuests,
  addGuestManual,
  getWeeklyActivity,
  getConfirmedGuestsWithHistory,
};
