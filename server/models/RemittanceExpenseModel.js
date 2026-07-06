const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RemittanceExpense = sequelize.define(
    'RemittanceExpense',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      remittance_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      expense_type: {
        type: DataTypes.ENUM(
          'officer',
          'toll_fees',
          'parking',
          'pwd',
          'washing',
          'diesel',
          'caller_grand_terminal',
          'caller_calamba_terminal',
          'miscellaneous'
        ),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
    },
    {
      tableName: 'remittance_expenses',
      timestamps: true,
      underscored: true,
    }
  );

  return RemittanceExpense;
};
