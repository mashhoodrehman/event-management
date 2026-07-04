"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ServicePricings", {
      id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
      },

      // stable key used in code
      key: {
        type: Sequelize.ENUM(
          "registration_fee",
          "sms_fee",
          "whatsapp_fee",
          "ai_call_fee",
          "human_call_fee"
        ),
        allowNull: false,
        unique: true,
      },

      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      // price in agorot (ILS smallest unit)
      priceAgorot: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      description: {
        type: Sequelize.TEXT,
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

    // ✅ Helpful indexes
    await queryInterface.addIndex("ServicePricings", ["key"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ServicePricings");
  },
};
