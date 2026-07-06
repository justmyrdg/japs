const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BusModel = sequelize.define(
    'BusModel',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      bus_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      plate_number: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'under_maintenance'),
        defaultValue: 'active',
      },
      driver_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      conductor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      route_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      tableName: 'buses',
      timestamps: true,
      underscored: true,
    }
  );

  return BusModel;
};
