// models/payment.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const Payment = sequelize.define("Payment", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  eventId: { type: DataTypes.INTEGER, allowNull: false },
  amount: { type: DataTypes.INTEGER, allowNull: false }, // cents
  currency: { type: DataTypes.STRING, defaultValue: "usd" },
  paymentIntentId: { type: DataTypes.STRING },
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
