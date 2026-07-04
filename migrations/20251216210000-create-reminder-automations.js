"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ReminderAutomations", {
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

      messageText: {
        type: Sequelize.TEXT,
        allowNull: true,
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

      scheduleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "ReminderAutomationSchedules", // ✅ your schedule table name
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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

    // ✅ Indexes for worker queries / dashboards
    await queryInterface.addIndex("ReminderAutomations", ["eventId"]);
    await queryInterface.addIndex("ReminderAutomations", ["scheduleId"]);
    await queryInterface.addIndex("ReminderAutomations", ["status"]);
    await queryInterface.addIndex("ReminderAutomations", ["scheduledAt"]);
    await queryInterface.addIndex("ReminderAutomations", ["rsvpToken"]);
    await queryInterface.addIndex("ReminderAutomations", ["billingPaymentId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ReminderAutomations");
  },
};
