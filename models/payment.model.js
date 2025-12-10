// models/payment.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const Payment = sequelize.define("Payment", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.INTEGER, allowNull: false }, // cents
  currency: { type: DataTypes.STRING, defaultValue: "ils" },
  paymentIntentId: { type: DataTypes.STRING },
  // 🔹 WHAT this payment is for
  type: {
    type: DataTypes.ENUM(
      "setup_fee",
      "sms_fee",
      "whatsapp_fee",
      "ai_call_fee",
      "human_call_fee"
    ),
    allowNull: false,
    defaultValue: "setup_fee",
  },

  // Optional: store client_secret if you use it on FE
  clientSecret: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM(
      "pending",
      "initiated",
      "succeeded",
      "failed",
      "requires_action"
    ),
    defaultValue: "pending",
  },
});

Event.hasOne(Payment, { foreignKey: "eventId", onDelete: "CASCADE" });
Payment.belongsTo(Event, { foreignKey: "eventId" });

module.exports = Payment;
