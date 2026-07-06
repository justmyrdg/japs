const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { Op } = require("sequelize");
const {
  Remittance,
  BusModel,
  User,
  RemittanceExpense,
  Trip,
  Route,
} = require("../models");

const router = express.Router();
router.use(authenticate, authorize("owner"));

// GET /api/owner/remittances
router.get("/remittances", async (req, res) => {
  try {
    const remittances = await Remittance.findAll({
      include: [
        { model: BusModel, attributes: ["id", "bus_number", "plate_number"] },
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
});

// GET /api/owner/remittances/:id
router.get("/remittances/:id", async (req, res) => {
  try {
    const remittance = await Remittance.findByPk(req.params.id, {
      include: [
        { model: BusModel, attributes: ["id", "bus_number", "plate_number"] },
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
    if (!remittance)
      return res.status(404).json({ message: "Remittance not found." });
    return res.json(remittance);
  } catch (error) {
    console.error("Error fetching remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;
