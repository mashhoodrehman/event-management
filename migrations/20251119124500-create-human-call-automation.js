"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("HumanCallAutomations", {
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

      // ✅ NEW: agent result
      callResult: {
        type: Sequelize.ENUM("confirmed", "hesitate", "cancel", "no_answer"),
        allowNull: true,
      },

      // ✅ NEW: agent who handled it
      agentId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Agents",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },

      // ✅ NEW: agent note
      agentNote: {
        type: Sequelize.TEXT,
        allowNull: true,
      },

      scheduledAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },

      // ✅ NEW: completed time
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
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

    // ✅ Helpful indexes for dashboards/queues
    await queryInterface.addIndex("HumanCallAutomations", ["eventId"]);
    await queryInterface.addIndex("HumanCallAutomations", ["agentId"]);
    await queryInterface.addIndex("HumanCallAutomations", ["status"]);
    await queryInterface.addIndex("HumanCallAutomations", ["scheduledAt"]);
    await queryInterface.addIndex("HumanCallAutomations", ["completedAt"]);
    await queryInterface.addIndex("HumanCallAutomations", ["rsvpToken"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("HumanCallAutomations");
  },
};
