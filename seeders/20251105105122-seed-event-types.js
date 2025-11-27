"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert("EventTypes", [
      { name: "Wedding", createdAt: new Date(), updatedAt: new Date() },
      { name: "Birthday", createdAt: new Date(), updatedAt: new Date() },
      { name: "Corporate", createdAt: new Date(), updatedAt: new Date() },
      { name: "Concert", createdAt: new Date(), updatedAt: new Date() },
      { name: "Conference", createdAt: new Date(), updatedAt: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("EventTypes", null, {});
  },
};
