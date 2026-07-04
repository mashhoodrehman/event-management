"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Guests", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      phone: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      status: {
        type: Sequelize.ENUM("pending", "confirmed", "hesitate", "cancel"),
        allowNull: false,
        defaultValue: "pending",
      },

      peopleCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },

      rsvpToken: {
        type: Sequelize.STRING,
        allowNull: true,
        unique: true,
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

    // 🔥 Useful indexes
    await queryInterface.addIndex("Guests", ["eventId"]);
    await queryInterface.addIndex("Guests", ["status"]);
    await queryInterface.addIndex("Guests", ["phone"]);
    await queryInterface.addIndex("Guests", ["rsvpToken"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Guests");
  },
};
