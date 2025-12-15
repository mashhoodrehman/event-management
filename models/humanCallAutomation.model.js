const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const HumanCallAutomation = sequelize.define("HumanCallAutomation", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  guestNumber: { type: DataTypes.STRING, allowNull: false },
  rsvpToken: { type: DataTypes.STRING, allowNull: false },
  templateId: { type: DataTypes.INTEGER, allowNull: true },

  status: {
    type: DataTypes.ENUM("queued_for_agent", "assigned", "success", "failed"),
    defaultValue: "queued_for_agent",
  },

  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  eventId: { type: DataTypes.INTEGER, allowNull: false },
  round: { type: DataTypes.INTEGER, defaultValue: 1 },

  billingPaymentId: { type: DataTypes.INTEGER, allowNull: true },

  assignedAgentId: { type: DataTypes.INTEGER, allowNull: true },
  assignedAt: { type: DataTypes.DATE, allowNull: true },

  // ✅ what agent reports after call
  callResult: {
    type: DataTypes.ENUM("confirmed", "hesitate", "cancel", "no_answer"),
    allowNull: true,
  },
  agentNotes: { type: DataTypes.TEXT, allowNull: true },

  scheduleKey: { type: DataTypes.STRING, allowNull: false },
});

module.exports = HumanCallAutomation;

// const { DataTypes } = require("sequelize");
// const sequelize = require("../config/database"); // your sequelize instance

// const HumanCallAutomation = sequelize.define("HumanCallAutomation", {
//   guestNumber: {
//     type: DataTypes.STRING,
//     allowNull: false,
//   },
//   rsvpToken: {
//     type: DataTypes.STRING,
//     allowNull: false,
//   },
//   templateId: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//   },
//   status: {
//     type: DataTypes.ENUM("pending", "failed", "success"),
//     defaultValue: "pending",
//   },
//   scheduledAt: {
//     type: DataTypes.DATE,
//     allowNull: false,
//   },
//   eventId: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//   },
//   round: {
//     type: DataTypes.INTEGER,
//     defaultValue: 1,
//   },
//   billingPaymentId: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//   },
// });

// module.exports = HumanCallAutomation;
