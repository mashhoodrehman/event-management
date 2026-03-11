"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventSettings", {
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

      // channel / automation type
      baseType: {
        type: Sequelize.ENUM("sms", "whatsapp", "ai_call", "human_call"),
        allowNull: false,
      },

      // execution date only (YYYY-MM-DD)
      executionDate: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },

      // order within same executionDate
      stepOrder: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      // number of rounds
      rounds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      // optional label shown in UI
      name: {
        type: Sequelize.STRING,
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

    // 🔥 Indexes for fast automation queries
    await queryInterface.addIndex("EventSettings", ["eventId"]);
    await queryInterface.addIndex("EventSettings", [
      "eventId",
      "executionDate",
    ]);
    await queryInterface.addIndex("EventSettings", [
      "eventId",
      "executionDate",
      "stepOrder",
    ]);
    await queryInterface.addIndex("EventSettings", ["baseType"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("EventSettings");

    // ENUM cleanup (important for Postgres, safe for MySQL)
    await queryInterface.sequelize
      .query('DROP TYPE IF EXISTS "enum_EventSettings_baseType";')
      .catch(() => {});
  },
};
