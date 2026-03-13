const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Event = require("./event.model");

const Device = sequelize.define("Device", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING, allowNull: false },
    circle: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1, // 1: Self, 2: Family, 3: Extended
    },
    pairingCode: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM("pending", "connected"),
        defaultValue: "pending",
        allowNull: false,
    },
    phone: {
        type: DataTypes.STRING,
        allowNull: true
    },
});

// Relationships
Event.hasMany(Device, { foreignKey: "eventId", onDelete: "CASCADE" });
Device.belongsTo(Event, { foreignKey: "eventId" });

module.exports = Device;
