"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("WhatsAppAutomations", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      guestNumber: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      rsvpToken: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      templateId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM("pending", "failed", "success"),
        allowNull: false,
        defaultValue: "pending",
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Events",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      round: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      billingPaymentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Payments",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    // ✅ Indexes for worker queue and admin filtering
    await queryInterface.addIndex("WhatsAppAutomations", ["eventId"]);
    await queryInterface.addIndex("WhatsAppAutomations", ["status"]);
    await queryInterface.addIndex("WhatsAppAutomations", ["scheduledAt"]);
    await queryInterface.addIndex("WhatsAppAutomations", ["rsvpToken"]);
    await queryInterface.addIndex("WhatsAppAutomations", ["billingPaymentId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("WhatsAppAutomations");
  },
};
