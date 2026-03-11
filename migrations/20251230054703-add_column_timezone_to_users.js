'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'timezone', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'UTC',
    })
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.remonveColumn('users', 'timezone');
  }
};
