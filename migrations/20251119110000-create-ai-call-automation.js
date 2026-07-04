"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("AICallAutomations", {
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
      },

      round: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      billingPaymentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
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
  },

  async down(queryInterface, Sequelize) {
    // required to drop ENUM safely in MySQL
    await queryInterface.dropTable("AICallAutomations");
    await queryInterface.sequelize
      .query('DROP TYPE IF EXISTS "enum_AICallAutomations_status";')
      .catch(() => {});
  },
};
