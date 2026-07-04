const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM("personal", "agency"), // 👈 allowed values
    allowNull: false,
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  // 🔹 Cardcom fields for saved card billing
  cardcomToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cardcomLast4: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cardcomExpMonth: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  cardcomExpYear: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  timezone: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: "UTC",
  },
});

module.exports = User;
