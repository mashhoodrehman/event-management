"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventAutomationSchedules", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true, // ✅ because Event hasOne EventAutomationSchedule
        references: {
          model: "Events",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      startDateTime: {
        type: Sequelize.DATE,
        allowNull: false,
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

    // helpful index
    await queryInterface.addIndex("EventAutomationSchedules", ["eventId"]);
    await queryInterface.addIndex("EventAutomationSchedules", [
      "startDateTime",
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventAutomationSchedules");
  },
};
