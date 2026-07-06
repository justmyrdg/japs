const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Remittance = sequelize.define(
    "Remittance",
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
        allowNull: false,
      },
      conductor_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      no_of_trips: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      gross_income: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      total_expenses: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      net_gross: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      driver_commission: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      conductor_commission: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      bonus_allowance: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      other_deductions: {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0,
      },
      cash_deposit: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      total_less: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      net_collection: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      driver_officer_share: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      conductor_officer_share: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("submitted", "approved", "rejected", "finalized"),
        defaultValue: "submitted",
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      teller_remarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "remittances",
      timestamps: true,
      underscored: true,
    },
  );

  return Remittance;
};
