"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Users", {
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

      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },

      password: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      type: {
        type: Sequelize.ENUM("personal", "agency"),
        allowNull: false,
      },

      isVerified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      verificationToken: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      // 🔹 Stripe saved-card billing
      stripeCustomerId: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      defaultPaymentMethodId: {
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

    // ✅ Useful indexes
    await queryInterface.addIndex("Users", ["email"]);
    await queryInterface.addIndex("Users", ["type"]);
    await queryInterface.addIndex("Users", ["isVerified"]);
    await queryInterface.addIndex("Users", ["stripeCustomerId"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Users");
  },
};
