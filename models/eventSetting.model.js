const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const EventSetting = sequelize.define("EventSetting", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.INTEGER, allowNull: false },

  // Toggles
  whatsappService: { type: DataTypes.BOOLEAN, defaultValue: false },
  smsService: { type: DataTypes.BOOLEAN, defaultValue: false },
  aiCallService: { type: DataTypes.BOOLEAN, defaultValue: false },
  humanCallService: { type: DataTypes.BOOLEAN, defaultValue: false },
  automaticSending: { type: DataTypes.BOOLEAN, defaultValue: false },
  automaticPause: { type: DataTypes.BOOLEAN, defaultValue: false },

  smsRounds: { type: DataTypes.INTEGER, allowNull: true },
  smsExecutionDays: { type: DataTypes.INTEGER, allowNull: true },

  // Day fields for WhatsApp
  whatsappRounds: { type: DataTypes.INTEGER, allowNull: true },
  whatsappExecutionDays: { type: DataTypes.INTEGER, allowNull: true },

  // Day fields for AI Call
  aiCallRounds: { type: DataTypes.INTEGER, allowNull: true },
  aiCallExecutionDays: { type: DataTypes.INTEGER, allowNull: true },

  // Day fields for Human Call
  humanCallRounds: { type: DataTypes.INTEGER, allowNull: true },
  humanCallExecutionDays: { type: DataTypes.INTEGER, allowNull: true },
});

Event.hasOne(EventSetting, { foreignKey: "eventId", onDelete: "CASCADE" });
EventSetting.belongsTo(Event, { foreignKey: "eventId" });

module.exports = EventSetting;
