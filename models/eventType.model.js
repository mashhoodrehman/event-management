const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EventType = sequelize.define("EventType", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = EventType;
