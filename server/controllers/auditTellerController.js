const {
  Trip,
  BusModel,
  Route,
  User,
  Remittance,
  RemittanceExpense,
  Ticket,
} = require("../models");
const { fullName, sendRemittanceStatusEmail } = require("../config/mailer");

const notify = (promise) => promise.catch((err) => console.error("Email notification failed:", err));

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
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "last_name"],
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
          include: [
            { model: Route, attributes: ["origin", "destination"] },
            {
              model: Ticket,
              attributes: [
                "id",
                "ticket_number",
                "category",
                "boarding_point",
                "boarding_km",
                "dropping_point",
                "dropping_km",
                "distance_km",
                "fare",
                "issued_at",
              ],
            },
          ],
        },
      ],
    });

    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    // Sort each trip's tickets by ticket_number for a readable audit trail.
    for (const trip of remittance.Trips) {
      trip.Tickets.sort((a, b) => Number(a.ticket_number) - Number(b.ticket_number));
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

    const remittance = await Remittance.findByPk(id, {
      include: [
        { model: BusModel, attributes: ["id", "bus_number"] },
        { model: User, as: "driver", attributes: ["id", "first_name", "last_name", "email"] },
        { model: User, as: "conductor", attributes: ["id", "first_name", "last_name", "email"] },
      ],
    });
    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    await remittance.update({
      status: "approved",
      approved_by: auditTellerId,
      approved_at: new Date(),
    });

    for (const user of [remittance.driver, remittance.conductor]) {
      if (!user) continue;
      notify(
        sendRemittanceStatusEmail({
          to: user.email,
          name: fullName(user),
          status: "approved",
          date: remittance.date,
          busLabel: remittance.BusModel?.bus_number ?? "",
        }),
      );
    }

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

    const remittance = await Remittance.findByPk(id, {
      include: [
        { model: BusModel, attributes: ["id", "bus_number"] },
        { model: User, as: "driver", attributes: ["id", "first_name", "last_name", "email"] },
        { model: User, as: "conductor", attributes: ["id", "first_name", "last_name", "email"] },
      ],
    });
    if (!remittance) {
      return res.status(404).json({ message: "Remittance not found." });
    }

    await remittance.update({
      status: "rejected",
      approved_by: auditTellerId,
      approved_at: new Date(),
      teller_remarks: reason || null,
    });

    for (const user of [remittance.driver, remittance.conductor]) {
      if (!user) continue;
      notify(
        sendRemittanceStatusEmail({
          to: user.email,
          name: fullName(user),
          status: "rejected",
          date: remittance.date,
          busLabel: remittance.BusModel?.bus_number ?? "",
          reason,
        }),
      );
    }

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
  updateRemittance,
  approveRemittance,
  rejectRemittance,
};
