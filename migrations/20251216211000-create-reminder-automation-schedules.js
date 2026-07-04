"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ReminderAutomationSchedules", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
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

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      messageText: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      channel: {
        type: Sequelize.ENUM("whatsapp", "sms"),
        allowNull: false,
      },

      targetAudience: {
        type: Sequelize.ENUM("all", "confirmed"),
        allowNull: false,
        defaultValue: "confirmed",
      },

      sendDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },

      sentCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      plannedRecipients: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    // ✅ Indexes for reminder workers & dashboards
    await queryInterface.addIndex("ReminderAutomationSchedules", ["eventId"]);
    await queryInterface.addIndex("ReminderAutomationSchedules", ["channel"]);
    await queryInterface.addIndex("ReminderAutomationSchedules", [
      "sendDateTime",
    ]);
    await queryInterface.addIndex("ReminderAutomationSchedules", ["isActive"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ReminderAutomationSchedules");
  },
};
