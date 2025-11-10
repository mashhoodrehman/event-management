"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("EventSettings", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      eventId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Events", // Must match your Event table name
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },

      // Toggles
      whatsappService: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      smsService: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      aiCallService: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      humanCallService: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      automaticSending: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      automaticPause: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },

      // Day fields for WhatsApp
      whatsappRounds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      whatsappExecutionDays: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      // Day fields for AI Call
      aiCallRounds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      aiCallExecutionDays: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },

      // Day fields for Human Call
      humanCallRounds: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      humanCallExecutionDays: {
        type: Sequelize.INTEGER,
        allowNull: true,
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
    await queryInterface.dropTable("EventSettings");
  },
};
