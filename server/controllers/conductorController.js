const { Op } = require("sequelize");
const {
  Trip,
  BusModel,
  Route,
  User,
  PassengerCount,
  Ticket,
  Remittance,
  RemittanceExpense,
  sequelize,
} = require("../models");
const { fullName, sendRemittanceSubmittedEmail } = require("../config/mailer");

const notify = (promise) => promise.catch((err) => console.error("Email notification failed:", err));

// GET /api/conductor/trips
// Returns completed unremitted trips for a bus on a date (for remittance submission)
const getAssignedTrips = async (req, res) => {
  try {
    const conductorId = req.user.id;
    const { date, busId } = req.query;

    // If date + busId provided, return completed unremitted trips for that bus/date
    if (date && busId) {
      const trips = await Trip.findAll({
        where: {
          bus_id: busId,
          conductor_id: conductorId,
          status: "completed",
          remittance_id: null,
          departure_time: {
            [Op.gte]: new Date(date + "T00:00:00"),
            [Op.lt]: new Date(
              new Date(date).getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
        include: [
          { model: BusModel, attributes: ["id", "bus_number", "plate_number"] },
          { model: Route, attributes: ["id", "origin", "destination"] },
          {
            model: User,
            as: "driver",
            attributes: ["id", "first_name", "last_name"],
          },
          {
            model: User,
            as: "conductor",
            attributes: ["id", "first_name", "last_name"],
          },
        ],
        order: [["departure_time", "ASC"]],
      });
      return res.json(trips);
    }

    // Default: return all trips assigned to conductor
    const trips = await Trip.findAll({
      where: { conductor_id: conductorId },
      include: [
        {
          model: BusModel,
          attributes: ["id", "bus_number", "plate_number", "capacity"],
        },
        {
          model: Route,
          attributes: [
            "id",
            "origin",
            "destination",
            "distance_km",
            "minimum_fare",
            "rate_per_km",
          ],
        },
        {
          model: User,
          as: "driver",
          attributes: ["id", "first_name", "last_name", "employee_id"],
        },
      ],
      order: [["departure_time", "ASC"]],
    });
    return res.json(trips);
  } catch (error) {
    console.error("Error fetching assigned trips:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// PUT /api/conductor/trips/:id/status
// Update trip status (scheduled -> ongoing -> completed/cancelled)
const updateTripStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const conductorId = req.user.id;

    if (!["scheduled", "ongoing", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const trip = await Trip.findOne({
      where: { id, conductor_id: conductorId },
    });
    if (!trip) {
      return res
        .status(404)
        .json({ message: "Trip not found or not assigned to you." });
    }

    const updateData = { status };
    if (status === "ongoing") {
      // Enforce that the trip's scheduled date matches today
      if (trip.departure_time) {
        const tripDate = new Date(trip.departure_time);
        const today = new Date();
        const isSameDay =
          tripDate.getFullYear() === today.getFullYear() &&
          tripDate.getMonth() === today.getMonth() &&
          tripDate.getDate() === today.getDate();
        if (!isSameDay) {
          return res.status(400).json({
            message: `This trip is scheduled for ${tripDate.toDateString()} and cannot be started today.`,
          });
        }
      } else {
        // No departure_time yet — set it now (today's trip)
        updateData.departure_time = new Date();
      }

      // Enforce sequential order: no earlier scheduled trip on the same bus today
      const today = new Date();
      const dayStart = new Date(today);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(today);
      dayEnd.setHours(23, 59, 59, 999);

      const blockers = await Trip.findAll({
        where: {
          bus_id: trip.bus_id,
          conductor_id: conductorId,
          trip_number: { [Op.lt]: trip.trip_number },
          status: "scheduled",
          departure_time: { [Op.between]: [dayStart, dayEnd] },
        },
      });

      if (blockers.length > 0) {
        const blockingNums = blockers
          .map((b) => `#${b.trip_number}`)
          .join(", ");
        return res.status(400).json({
          message: `You must complete trip${blockers.length > 1 ? "s" : ""} ${blockingNums} before starting this one.`,
        });
      }
    } else if (status === "completed") {
      updateData.arrival_time = new Date();
    }

    await trip.update(updateData);
    return res.json(trip);
  } catch (error) {
    console.error("Error updating trip status:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/conductor/trips/:id/passenger-counts
const getTripPassengerCounts = async (req, res) => {
  try {
    const { id } = req.params;
    const conductorId = req.user.id;

    const trip = await Trip.findOne({
      where: { id, conductor_id: conductorId },
    });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    const counts = await PassengerCount.findAll({ where: { trip_id: id } });
    return res.json(counts);
  } catch (error) {
    console.error("Error fetching passenger counts:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// POST /api/conductor/trips/:id/passenger-counts
// Save/update passenger counts for a trip
const savePassengerCounts = async (req, res) => {
  try {
    const { id } = req.params;
    const { counts } = req.body; // Array of { category, count }
    const conductorId = req.user.id;

    const trip = await Trip.findOne({
      where: { id, conductor_id: conductorId },
    });
    if (!trip) {
      return res.status(404).json({ message: "Trip not found." });
    }

    // Delete existing passenger counts for this trip to overwrite
    await PassengerCount.destroy({ where: { trip_id: id } });

    const createdCounts = [];
    for (const item of counts) {
      const pc = await PassengerCount.create({
        trip_id: id,
        category: item.category,
        count: item.count,
      });
      createdCounts.push(pc);
    }

    return res.json(createdCounts);
  } catch (error) {
    console.error("Error saving passenger counts:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// POST /api/conductor/trips/:id/tickets
// Encode and simulate printing a ticket (updates ticket range, passenger count and grand total)
const printTicket = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { category, fare, distance } = req.body;
    const conductorId = req.user.id;

    const trip = await Trip.findOne({
      where: { id, conductor_id: conductorId },
      transaction,
    });
    if (!trip) {
      await transaction.rollback();
      return res.status(404).json({ message: "Trip not found." });
    }

    // 1. Auto-generate ticket number (last for this trip + 1, starting at 1)
    const lastTicket = await Ticket.findOne({
      where: { trip_id: id },
      order: [["ticket_number", "DESC"]],
      transaction,
    });
    const ticketNumber = lastTicket ? Number(lastTicket.ticket_number) + 1 : 1;

    // 2. Create individual ticket record
    const ticket = await Ticket.create(
      {
        trip_id: id,
        ticket_number: ticketNumber,
        category,
        distance_km: distance || 0,
        fare,
        issued_at: new Date(),
      },
      { transaction },
    );

    // 3. Update Trip Grand Total
    const newGrandTotal = Number(trip.grand_total) + Number(fare);

    // 4. Update Ticket Number Range
    const ticketStart = trip.ticket_number_start ?? ticketNumber;
    const ticketEnd = ticketNumber;

    await trip.update(
      {
        grand_total: newGrandTotal,
        ticket_number_start: ticketStart,
        ticket_number_end: ticketEnd,
      },
      { transaction },
    );

    // 5. Increment Passenger Count Category
    const [pc, created] = await PassengerCount.findOrCreate({
      where: { trip_id: id, category },
      defaults: { count: 0 },
      transaction,
    });

    await pc.increment("count", { by: 1, transaction });
    await pc.reload({ transaction });

    await transaction.commit();

    return res.json({
      message: "Ticket printed successfully.",
      ticket,
      trip: {
        id: trip.id,
        grand_total: newGrandTotal,
        ticket_number_start: ticketStart,
        ticket_number_end: ticketEnd,
      },
      passengerCount: pc,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error printing ticket:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/conductor/tickets
// Get all tickets for conductor's trips
const getTickets = async (req, res) => {
  try {
    const conductorId = req.user.id;
    const { tripId } = req.query;

    const where = {};
    if (tripId) {
      // Verify trip belongs to conductor
      const trip = await Trip.findOne({
        where: { id: tripId, conductor_id: conductorId },
      });
      if (!trip) {
        return res.status(404).json({ message: "Trip not found." });
      }
      where.trip_id = tripId;
    }

    const tickets = await Ticket.findAll({
      where,
      include: [
        {
          model: Trip,
          where: { conductor_id: conductorId },
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
        },
      ],
      order: [["issued_at", "DESC"]],
    });

    return res.json(tickets);
  } catch (error) {
    console.error("Error fetching tickets:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// POST /api/conductor/remittances
// Submit expenses and operational reports
const submitRemittance = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const conductorId = req.user.id;
    const {
      bus_id,
      driver_id,
      date,
      trip_ids, // array of trip IDs completed
      expenses, // array of { expense_type, amount }
      driver_commission = 0,
      conductor_commission = 0,
      bonus_allowance = 0,
      other_deductions = 0,
      cash_deposit = 0,
      driver_officer_share = 0,
      conductor_officer_share = 0,
    } = req.body;

    if (!bus_id || !driver_id || !date || !trip_ids || trip_ids.length === 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ message: "Missing required remittance fields." });
    }

    // 1. Fetch completed trips to calculate actual gross income
    const trips = await Trip.findAll({
      where: {
        id: { [Op.in]: trip_ids },
        conductor_id: conductorId,
      },
      transaction,
    });

    if (trips.length === 0) {
      await transaction.rollback();
      return res
        .status(404)
        .json({ message: "No valid trips found for remittance." });
    }

    // A prior rejected remittance for the same bus/date/conductor means this is a resubmission.
    const priorRejected = await Remittance.findOne({
      where: { bus_id, conductor_id: conductorId, date, status: "rejected" },
      transaction,
    });

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

    // Create Remittance record
    const remittance = await Remittance.create(
      {
        bus_id,
        driver_id,
        conductor_id: conductorId,
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

    // Link trips to this remittance
    await Trip.update(
      { remittance_id: remittance.id },
      { where: { id: { [Op.in]: trip_ids } }, transaction },
    );

    // Create expenses
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

    notify(
      (async () => {
        const [bus, conductor, reviewers] = await Promise.all([
          BusModel.findByPk(bus_id),
          User.findByPk(conductorId),
          User.findAll({ where: { role: ["owner", "audit_teller"], is_active: true } }),
        ]);
        for (const reviewer of reviewers) {
          await sendRemittanceSubmittedEmail({
            to: reviewer.email,
            conductorName: conductor ? fullName(conductor) : "A conductor",
            busLabel: bus?.bus_number ?? String(bus_id),
            date,
            netCollection,
            isResubmission: !!priorRejected,
          });
        }
      })(),
    );

    return res.status(201).json(remittance);
  } catch (error) {
    await transaction.rollback();
    console.error("Error submitting remittance:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

// GET /api/conductor/remittances
const getRemittances = async (req, res) => {
  try {
    const conductorId = req.user.id;
    const remittances = await Remittance.findAll({
      where: { conductor_id: conductorId },
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
      order: [["submitted_at", "DESC"]],
    });
    return res.json(remittances);
  } catch (error) {
    console.error("Error fetching remittances:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

module.exports = {
  getAssignedTrips,
  updateTripStatus,
  getTripPassengerCounts,
  savePassengerCounts,
  printTicket,
  getTickets,
  submitRemittance,
  getRemittances,
};
