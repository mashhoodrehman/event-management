const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // your sequelize instance

const AICallAutomation = sequelize.define("AICallAutomation", {
  guestNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rsvpToken: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM("pending", "failed", "success"),
    defaultValue: "pending",
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  eventId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  round: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
});

module.exports = AICallAutomation;
