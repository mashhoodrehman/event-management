"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Guests", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
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

      rsvpToken: {
        type: Sequelize.STRING,
        unique: true,
      },

      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Events", // your events table
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },

      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Guests");
  },
};
