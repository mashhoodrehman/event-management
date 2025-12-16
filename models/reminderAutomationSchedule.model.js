// models/reminderAutomationSchedule.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ReminderAutomationSchedule = sequelize.define(
  "ReminderAutomationSchedule",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    name: {
      // "תזכורת שבוע לפני"
      type: DataTypes.STRING,
      allowNull: false,
    },
    // templateId: {
    //   // could be MessageTemplate.id or dedicated reminder template id
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    // },
    messageText: {
      // snapshot of text at creation time (optional but useful)
      type: DataTypes.TEXT,
      allowNull: true,
    },
    channel: {
      type: DataTypes.ENUM("whatsapp", "sms"),
      allowNull: false,
    },
    targetAudience: {
      type: DataTypes.ENUM("all", "confirmed"),
      allowNull: false,
      defaultValue: "confirmed",
    },
    sendDateTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    plannedRecipients: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  }
);

module.exports = ReminderAutomationSchedule;
