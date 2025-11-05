const EventType = require("../models/eventType.model");

const seedEventTypes = async () => {
  const count = await EventType.count();
  if (count === 0) {
    await EventType.bulkCreate([
      { name: "Wedding" },
      { name: "Birthday" },
      { name: "Corporate Event" },
      { name: "Concert" },
      { name: "Charity Event" },
    ]);
    console.log("✅ Event types seeded successfully");
  }
};

module.exports = seedEventTypes;
