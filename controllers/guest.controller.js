const { Op } = require("sequelize");

const Guest = require("../models/guest.model");
const Event = require("../models/event.model");
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
            "endDate",
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

module.exports = {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
  getRecentActivity,
  getGuestStats,
};
