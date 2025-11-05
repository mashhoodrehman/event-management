const EventType = require("../models/eventType.model");

const getEventTypes = async (req, res) => {
  try {
    const types = await EventType.findAll({
      order: [["id", "ASC"]],
    });
    res.status(200).json(types);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getEventTypes };
