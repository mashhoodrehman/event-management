const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./user.model");

const Event = sequelize.define("Event", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  typeId: { type: DataTypes.INTEGER, allowNull: false },
  eventDate: { type: DataTypes.DATE, allowNull: false }, // contains date + time
  endDate: { type: DataTypes.DATE, allowNull: false }, // contains date + time
  location: { type: DataTypes.STRING, allowNull: false },

  locationName: { type: DataTypes.STRING, allowNull: true },
  locationLat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  locationLng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },

  estimatedGuests: { type: DataTypes.INTEGER, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  invitationFile: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM(
      "draft",
      "step1_completed",
      "step2_completed",
      "step3_completed",
      "step4_completed",
      "step5_completed",
      "completed"
    ),
    defaultValue: "draft",
  },
  // ⚡ Virtual active field — NOT stored in DB
  active: {
    type: DataTypes.VIRTUAL,
    get() {
      const now = new Date();
      return new Date(this.eventDate) >= now;
    },
  },
});

// Relationships
User.hasMany(Event, { foreignKey: "userId" });
Event.belongsTo(User, { foreignKey: "userId" });

module.exports = Event;
