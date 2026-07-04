"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Events", {
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

      typeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      eventDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      location: {
        type: Sequelize.STRING,
        allowNull: false,
      },

      locationName: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      locationLat: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },

      locationLng: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },

      estimatedGuests: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      invitationFile: {
        type: Sequelize.STRING,
        allowNull: true,
      },

      status: {
        type: Sequelize.ENUM(
          "draft",
          "step1_completed",
          "step2_completed",
          "step3_completed",
          "step4_completed",
          "completed"
        ),
        allowNull: false,
        defaultValue: "draft",
      },

      // 🔗 Relation to User
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
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

    // 🔥 Helpful indexes for performance
    await queryInterface.addIndex("Events", ["userId"]);
    await queryInterface.addIndex("Events", ["status"]);
    await queryInterface.addIndex("Events", ["eventDate"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Events");

    // ENUM cleanup (safe for MySQL, needed for Postgres)
    await queryInterface.sequelize
      .query('DROP TYPE IF EXISTS "enum_Events_status";')
      .catch(() => {});
  },
};
