const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const FareSettings = sequelize.define(
    "FareSettings",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      minimum_fare: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      base_distance_km: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 5,
      },
      rate_per_km: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        defaultValue: 0,
      },
      regular_multiplier: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 100,
      },
      student_multiplier: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 80,
      },
      senior_citizen_multiplier: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 80,
      },
      pwd_multiplier: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 80,
      },
      discounted_multiplier: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 80,
      },
      effective_date: { type: DataTypes.DATEONLY, allowNull: false },
    },
    {
      tableName: "fare_settings",
      timestamps: true,
      underscored: true,
    },
  );

  return FareSettings;
};
