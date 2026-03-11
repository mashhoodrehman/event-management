"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Payments", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // ✅ Event.hasOne(Payment)
        references: {
          model: "Events",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      amount: {
        type: Sequelize.INTEGER,
        allowNull: false, // stored in cents / agorot
      },

      currency: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: "ils",
      },

      paymentIntentId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // 🔹 what this payment is for
      type: {
        type: Sequelize.ENUM(
          "setup_fee",
          "sms_fee",
          "whatsapp_fee",
          "ai_call_fee",
          "human_call_fee",
          "reminder_sms_fee",
          "reminder_whatsapp_fee"
        ),
        allowNull: false,
        defaultValue: "setup_fee",
      },

      clientSecret: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM(
          "pending",
          "initiated",
          "succeeded",
          "failed",
          "requires_action"
        ),
        allowNull: false,
        defaultValue: "pending",
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
    });

    // 🔥 Helpful indexes for billing dashboards & webhooks
    await queryInterface.addIndex("Payments", ["eventId"]);
    await queryInterface.addIndex("Payments", ["status"]);
    await queryInterface.addIndex("Payments", ["type"]);
    await queryInterface.addIndex("Payments", ["paymentIntentId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Payments");
  },
};
