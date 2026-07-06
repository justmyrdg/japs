const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const BusCrewHistory = sequelize.define(
    'BusCrewHistory',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      bus_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      driver_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      conductor_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      unassigned_at: {
        type: DataTypes.DATE,
        allowNull: true, // null = currently active assignment
      },
    },
    {
      tableName: 'bus_crew_history',
      timestamps: false,
      underscored: true,
    }
  );

  return BusCrewHistory;
};
