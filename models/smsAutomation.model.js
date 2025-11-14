const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // your sequelize instance

const SMSAutomation = sequelize.define("SMSAutomation", {
  guestNumber: {
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

module.exports = SMSAutomation;
