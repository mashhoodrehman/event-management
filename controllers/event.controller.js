const Event = require("../models/event.model");

const createEvent = async (req, res) => {
  try {
    const { name, typeId, eventDate, location, estimatedGuests, description } =
      req.body;
    const userId = req.user.id; // from auth middleware

    const event = await Event.create({
      name,
      typeId,
      eventDate,
      location,
      estimatedGuests,
      description,
      userId,
      invitationFile: req.file ? req.file.path : null,
    });

    res.status(201).json({ message: "Event created successfully", event });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 🧠 Get all events for logged-in user
const getUserEvents = async (req, res) => {
  try {
    const userId = req.user.id;

    const events = await Event.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createEvent, getUserEvents };
