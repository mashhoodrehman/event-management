// models/reminderAutomation.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ReminderAutomation = sequelize.define("ReminderAutomation", {
  guestNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rsvpToken: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  //   templateId: {
  //     type: DataTypes.INTEGER,
  //     allowNull: false,
  //   },
  messageText: {
    // snapshot of text at creation time (optional but useful)
    type: DataTypes.TEXT,
    allowNull: true,
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
  scheduleId: {
    // FK to ReminderAutomationSchedule.id
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  billingPaymentId: {
    // FK to Payment.id
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

module.exports = ReminderAutomation;
