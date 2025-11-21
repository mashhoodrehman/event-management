const { Op } = require("sequelize");

const Guest = require("../models/guest.model");
const Event = require("../models/event.model");

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

module.exports = {
  updateRSVPStatus,
  getGuestDetails,
  getGuestsByFilters,
};
