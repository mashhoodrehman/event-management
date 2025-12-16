const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // your sequelize instance

const HumanCallAutomation = sequelize.define("HumanCallAutomation", {
  guestNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  rsvpToken: {
    type: DataTypes.STRING,
    allowNull: false,
  },

  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  status: {
    type: DataTypes.ENUM("pending", "failed", "success"),
    defaultValue: "pending",
  },

  // 🔹 NEW: agent result
  callResult: {
    type: DataTypes.ENUM("confirmed", "hesitate", "cancel", "no_answer"),
    allowNull: true,
  },

  // 🔹 NEW: which agent handled this call
  agentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // 🔹 NEW: optional notes from agent
  agentNote: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },

  // 🔹 NEW: helps completed tab & sorting
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  eventId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  round: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },

  billingPaymentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
});

module.exports = HumanCallAutomation;

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
