const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const MessageTemplate = sequelize.define("MessageTemplate", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.INTEGER, allowNull: false },
  //   type: { type: DataTypes.STRING, allowNull: false }, // e.g. "whatsapp" | "sms" | "email"
  //   subject: { type: DataTypes.STRING },
  messageBody: { type: DataTypes.TEXT, allowNull: false },
});

Event.hasOne(MessageTemplate, { foreignKey: "eventId" });
MessageTemplate.belongsTo(Event, { foreignKey: "eventId" });

module.exports = MessageTemplate;
