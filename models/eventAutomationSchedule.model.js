const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const EventAutomationSchedule = sequelize.define("EventAutomationSchedule", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.INTEGER, allowNull: false },
  startDateTime: { type: DataTypes.DATE, allowNull: false },
});

Event.hasOne(EventAutomationSchedule, { foreignKey: "eventId" });
EventAutomationSchedule.belongsTo(Event, { foreignKey: "eventId" });

module.exports = EventAutomationSchedule;
