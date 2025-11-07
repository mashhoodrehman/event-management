const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const Guest = sequelize.define("Guest", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: false },
  //   eventId: { type: DataTypes.INTEGER, allowNull: false },
});

// Relationships
Event.hasMany(Guest, { foreignKey: "eventId", onDelete: "CASCADE" });
Guest.belongsTo(Event, { foreignKey: "eventId" });

module.exports = Guest;
