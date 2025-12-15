const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Agent = sequelize.define("Agent", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  name: { type: DataTypes.STRING, allowNull: false },

  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },

  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
});

module.exports = Agent;
