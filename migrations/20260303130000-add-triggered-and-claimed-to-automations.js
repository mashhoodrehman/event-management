"use strict";

module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = [
            "SMSAutomations",
            "WhatsAppAutomations",
            "AICallAutomations",
            "HumanCallAutomations",
        ];

        for (const table of tables) {
            await queryInterface.addColumn(table, "isTriggered", {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            });

            await queryInterface.addColumn(table, "billingClaimedAt", {
                type: Sequelize.DATE,
                allowNull: true,
            });

            // Index for claiming
            await queryInterface.addIndex(table, ["billingClaimedAt"]);
        }
    },

    async down(queryInterface, Sequelize) {
        const tables = [
            "SMSAutomations",
            "WhatsAppAutomations",
            "AICallAutomations",
            "HumanCallAutomations",
        ];

        for (const table of tables) {
            await queryInterface.removeColumn(table, "isTriggered");
            await queryInterface.removeColumn(table, "billingClaimedAt");
        }
    },
};
