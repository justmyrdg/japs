const { Trip, BusModel, Route, User } = require('../models');

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

module.exports = {
  getAssignedTrips,
};
