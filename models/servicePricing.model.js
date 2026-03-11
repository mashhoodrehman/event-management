// models/servicePricing.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ServicePricing = sequelize.define("ServicePricing", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  // stable key you use in code
  key: {
    type: DataTypes.ENUM(
      "registration_fee",
      "sms_fee",
      "whatsapp_fee",
      "ai_call_fee",
      "human_call_fee"
    ),
    allowNull: false,
    unique: true,
  },

  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  // store in agorot (smallest ILS unit) like your current pricing constants
  priceAgorot: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },

  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

module.exports = ServicePricing;
