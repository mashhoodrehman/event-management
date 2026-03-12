const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Device = require("./device.model");

const Contact = sequelize.define("Contact", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
});

// Relationships
Device.hasMany(Contact, { foreignKey: "deviceId", onDelete: "CASCADE" });
Contact.belongsTo(Device, { foreignKey: "deviceId" });

module.exports = Contact;
