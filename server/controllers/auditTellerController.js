const { Op } = require("sequelize");
const {
  Trip,
  BusModel,
  Route,
  User,
  Remittance,
  RemittanceExpense,
  sequelize,
} = require("../models");

// GET /api/audit-teller/stats
// Get dashboard statistics
const getStats = async (req, res) => {
  try {
    const pending = await Remittance.count({ where: { status: "submitted" } });
    const approved = await Remittance.count({ where: { status: "approved" } });
    const rejected = await Remittance.count({ where: { status: "rejected" } });
    const total = await Remittance.count();

    return res.json({ pending, approved, rejected, total });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/audit-teller/remittances
// Get all remittances with filters
const getRemittances = async (req, res) => {
  try {
    const remittances = await Remittance.findAll({
      include: [
        {
          model: BusModel,
          attributes: ["id", "bus_number", "plate_number"],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "conductor",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
      ],
      order: [["submitted_at", "DESC"]],
    });
    return res.json(remittances);
  } catch (error) {
    console.error("Error fetching remittances:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/audit-teller/drivers
const getDrivers = async (req, res) => {
  try {
    const drivers = await User.findAll({
      where: { role: "driver" },
      attributes: ["id", "first_name", "last_name", "employee_id"],
      order: [["first_name", "ASC"]],
    });
    return res.json(drivers);
  } catch (error) {
    console.error("Error fetching drivers:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/audit-teller/conductors
// Get all conductors for selection
const getConductors = async (req, res) => {
  try {
    const conductors = await User.findAll({
      where: { role: "conductor" },
      attributes: ["id", "first_name", "last_name", "employee_id"],
      order: [["first_name", "ASC"]],
    });
    return res.json(conductors);
  } catch (error) {
    console.error("Error fetching conductors:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/audit-teller/trips
// Get completed unremitted trips by date and bus
const getTrips = async (req, res) => {
  try {
    const { date, busId } = req.query;

    if (!date || !busId) {
      return res.status(400).json({ message: "Date and busId are required." });
    }

    const trips = await Trip.findAll({
      where: {
        status: "completed",
        remittance_id: null,
        bus_id: busId,
        departure_time: {
          [Op.gte]: new Date(date + "T00:00:00"),
          [Op.lt]: new Date(
            new Date(date).getTime() + 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      },
      include: [
        {
          model: BusModel,
          attributes: ["id", "bus_number", "plate_number"],
        },
        {
          model: Route,
          attributes: ["id", "origin", "destination"],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "conductor",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
      ],
      order: [["departure_time", "ASC"]],
    });

    return res.json(trips);
  } catch (error) {
    console.error("Error fetching trips:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// POST /api/audit-teller/remittances
// Create remittance report
const createRemittance = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      bus_id,
      driver_id,
      conductor_id,
      date,
      trip_ids,
      expenses,
      driver_commission = 0,
      conductor_commission = 0,
      bonus_allowance = 0,
      other_deductions = 0,
      cash_deposit = 0,
      driver_officer_share = 0,
      conductor_officer_share = 0,
    } = req.body;

    if (
      !bus_id ||
      !driver_id ||
      !conductor_id ||
      !date ||
      !trip_ids ||
      trip_ids.length === 0
    ) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ message: "Missing required remittance fields." });
    }

    const trips = await Trip.findAll({
      where: {
        id: { [Op.in]: trip_ids },
        conductor_id: conductor_id,
      },
      transaction,
    });

    if (trips.length === 0) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ message: "No valid trips found for remittance." });
    }

    const grossIncome = trips.reduce(
      (sum, t) => sum + Number(t.grand_total),
      0,
    );
    const totalExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );
    const netGross = grossIncome - totalExpenses;

    const totalLess =
      Number(driver_commission) +
      Number(conductor_commission) +
      Number(bonus_allowance) +
      Number(other_deductions) +
      Number(cash_deposit);

    const netCollection = netGross - totalLess;

    const remittance = await Remittance.create(
      {
        bus_id,
        driver_id,
        conductor_id,
        date,
        no_of_trips: trips.length,
        gross_income: grossIncome,
        total_expenses: totalExpenses,
        net_gross: netGross,
        driver_commission,
        conductor_commission,
        bonus_allowance,
        other_deductions,
        cash_deposit,
        total_less: totalLess,
        net_collection: netCollection,
        driver_officer_share,
        conductor_officer_share,
        status: "submitted",
        submitted_at: new Date(),
      },
      { transaction },
    );

    await Trip.update(
      { remittance_id: remittance.id },
      { where: { id: { [Op.in]: trip_ids } }, transaction },
    );

    for (const exp of expenses) {
      await RemittanceExpense.create(
        {
          remittance_id: remittance.id,
          expense_type: exp.expense_type,
          amount: exp.amount,
        },
        { transaction },
      );
    }

    await transaction.commit();
    return res.status(201).json(remittance);
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/audit-teller/remittances/:id
// Get a single remittance with full details
const getRemittanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const remittance = await Remittance.findByPk(id, {
      include: [
        {
          model: BusModel,
          attributes: ["id", "bus_number", "plate_number"],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "conductor",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "last_name"],
        },
        {
          model: RemittanceExpense,
          attributes: ["id", "expense_type", "amount"],
        },
        {
          model: Trip,
          attributes: [
            "id",
            "trip_number",
            "departure_time",
            "grand_total",
            "ticket_number_start",
            "ticket_number_end",
          ],
          include: [{ model: Route, attributes: ["origin", "destination"] }],
        },
      ],
    });

    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    return res.json(remittance);
  } catch (error) {
    console.error("Error fetching remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// PUT /api/audit-teller/remittances/:id
// Update (correct) a submitted remittance — recalculates derived totals
const updateRemittance = async (req, res) => {
  try {
    const { id } = req.params;
    const remittance = await Remittance.findByPk(id);
    if (!remittance)
      return res.status(404).json({ message: "Remittance not found." });
    if (remittance.status === "approved") {
      return res
        .status(400)
        .json({ message: "Cannot edit an already-approved remittance." });
    }

    const {
      gross_income,
      total_expenses,
      driver_commission,
      conductor_commission,
      bonus_allowance,
      other_deductions,
      cash_deposit,
      driver_officer_share,
      conductor_officer_share,
      teller_remarks,
    } = req.body;

    const netGross = Number(gross_income) - Number(total_expenses);
    const totalLess =
      Number(driver_commission) +
      Number(conductor_commission) +
      Number(bonus_allowance || 0) +
      Number(other_deductions || 0) +
      Number(cash_deposit);
    const netCollection = netGross - totalLess;

    await remittance.update({
      gross_income,
      total_expenses,
      net_gross: netGross,
      driver_commission,
      conductor_commission,
      bonus_allowance: bonus_allowance || 0,
      other_deductions: other_deductions || 0,
      cash_deposit,
      total_less: totalLess,
      net_collection: netCollection,
      driver_officer_share: driver_officer_share || 0,
      conductor_officer_share: conductor_officer_share || 0,
      teller_remarks: teller_remarks || null,
    });

    return res.json(remittance);
  } catch (error) {
    console.error("Error updating remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// PUT /api/audit-teller/remittances/:id/approve
// Approve a remittance
const approveRemittance = async (req, res) => {
  try {
    const { id } = req.params;
    const auditTellerId = req.user.id;

    const remittance = await Remittance.findByPk(id);
    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    await remittance.update({
      status: "approved",
      approved_by: auditTellerId,
      approved_at: new Date(),
    });

    return res.json(remittance);
  } catch (error) {
    console.error("Error approving remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// PUT /api/audit-teller/remittances/:id/reject
// Reject a remittance
const rejectRemittance = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const auditTellerId = req.user.id;

    const remittance = await Remittance.findByPk(id);
    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    await remittance.update({
      status: "rejected",
      approved_by: auditTellerId,
      approved_at: new Date(),
    });

    return res.json(remittance);
  } catch (error) {
    console.error("Error rejecting remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  getStats,
  getRemittances,
  getRemittanceById,
  getDrivers,
  getConductors,
  getTrips,
  createRemittance,
  updateRemittance,
  approveRemittance,
  rejectRemittance,
};
