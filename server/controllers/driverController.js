const { Trip, BusModel, Route, User, Remittance, RemittanceExpense } = require('../models');

// GET /api/driver/trips
// Returns all trips assigned to the logged-in driver
const getAssignedTrips = async (req, res) => {
  try {
    const driverId = req.user.id;
    const trips = await Trip.findAll({
      where: { driver_id: driverId },
      include: [
        { model: BusModel, attributes: ['id', 'bus_number', 'plate_number', 'capacity'] },
        { model: Route, attributes: ['id', 'origin', 'destination', 'distance_km'] },
        { model: User, as: 'conductor', attributes: ['id', 'first_name', 'last_name', 'employee_id', 'contact_number'] },
      ],
      order: [['departure_time', 'ASC']],
    });
    return res.json(trips);
  } catch (error) {
    console.error('Error fetching assigned trips:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

// GET /api/driver/remittances
// Returns only remittances belonging to the logged-in driver — a read-only disclosure
// of the trip's remittance (drivers cannot submit, edit, approve, or reject).
const getRemittances = async (req, res) => {
  try {
    const driverId = req.user.id;
    const remittances = await Remittance.findAll({
      where: { driver_id: driverId },
      include: [
        { model: BusModel, attributes: ['id', 'bus_number', 'plate_number'] },
        {
          model: User,
          as: 'driver',
          attributes: ['id', 'first_name', 'last_name', 'employee_id'],
        },
        {
          model: User,
          as: 'conductor',
          attributes: ['id', 'first_name', 'last_name', 'employee_id'],
        },
        {
          model: User,
          as: 'approver',
          attributes: ['id', 'first_name', 'last_name'],
        },
        {
          model: RemittanceExpense,
          attributes: ['id', 'expense_type', 'amount'],
        },
        {
          model: Trip,
          attributes: [
            'id',
            'trip_number',
            'departure_time',
            'grand_total',
            'ticket_number_start',
            'ticket_number_end',
          ],
          include: [{ model: Route, attributes: ['origin', 'destination'] }],
        },
      ],
      order: [['submitted_at', 'DESC']],
    });
    return res.json(remittances);
  } catch (error) {
    console.error('Error fetching driver remittances:', error);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

module.exports = {
  getAssignedTrips,
  getRemittances,
};
