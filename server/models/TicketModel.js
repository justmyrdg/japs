const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Ticket = sequelize.define(
    "Ticket",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      trip_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "trips", key: "id" },
      },
      ticket_number: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM(
          "regular",
          "student",
          "senior_citizen",
          "pwd",
          "discounted",
        ),
        allowNull: false,
        defaultValue: "regular",
      },
      boarding_point: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      boarding_km: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      dropping_point: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dropping_km: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
      },
      distance_km: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
      },
      fare: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      issued_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "tickets",
      timestamps: true,
      underscored: true,
    },
  );

  return Ticket;
};
