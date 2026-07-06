const { Op } = require('sequelize');
const { BusModel, User, Trip, Route, BusCrewHistory } = require('../models');

const busInclude = [
  { model: User, as: 'driver', attributes: ['id', 'first_name', 'last_name', 'employee_id'], foreignKey: 'driver_id' },
  { model: User, as: 'conductor', attributes: ['id', 'first_name', 'last_name', 'employee_id'], foreignKey: 'conductor_id' },
];

// GET /api/buses
const getBuses = async (req, res) => {
  const buses = await BusModel.findAll({
    order: [['bus_number', 'ASC']],
    include: [
      { model: User, as: 'assignedDriver', attributes: ['id', 'first_name', 'last_name', 'employee_id'] },
      { model: User, as: 'assignedConductor', attributes: ['id', 'first_name', 'last_name', 'employee_id'] },
      { model: Route, as: 'defaultRoute', attributes: ['id', 'origin', 'destination'] },
    ],
  });
  return res.json(buses);
};

// POST /api/buses
const createBus = async (req, res) => {
  const { bus_number, plate_number, capacity, status } = req.body;
  const bus = await BusModel.create({ bus_number, plate_number, capacity, status });
  return res.status(201).json(bus);
};

// PUT /api/buses/:id
const updateBus = async (req, res) => {
  const bus = await BusModel.findByPk(req.params.id);
  if (!bus) return res.status(404).json({ message: 'Bus not found.' });
  const { bus_number, plate_number, capacity, status, route_id } = req.body;
  await bus.update({ bus_number, plate_number, capacity, status, route_id: route_id ?? null });
  return res.json(bus);
};

// DELETE /api/buses/:id
const deleteBus = async (req, res) => {
  const bus = await BusModel.findByPk(req.params.id);
  if (!bus) return res.status(404).json({ message: 'Bus not found.' });
  await bus.destroy();
  return res.status(204).send();
};

// PUT /api/buses/:id/assign-crew
const assignCrew = async (req, res) => {
  const bus = await BusModel.findByPk(req.params.id);
  if (!bus) return res.status(404).json({ message: 'Bus not found.' });

  const { driver_id, conductor_id } = req.body;
  const now = new Date();

  // Close any open history record for this bus
  await BusCrewHistory.update(
    { unassigned_at: now },
    { where: { bus_id: bus.id, unassigned_at: null } }
  );

  // Only create a new history row if there's actually someone being assigned
  if (driver_id || conductor_id) {
    await BusCrewHistory.create({
      bus_id: bus.id,
      driver_id: driver_id || null,
      conductor_id: conductor_id || null,
      assigned_at: now,
    });
  }

  await bus.update({ driver_id: driver_id || null, conductor_id: conductor_id || null });
  return res.json(bus);
};

// GET /api/buses/trips?date=YYYY-MM-DD  OR  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
const getTrips = async (req, res) => {
  let start, end;

  if (req.query.startDate && req.query.endDate) {
    start = new Date(req.query.startDate); start.setHours(0, 0, 0, 0);
    end   = new Date(req.query.endDate);   end.setHours(23, 59, 59, 999);
  } else {
    const date = req.query.date ? new Date(req.query.date) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })();
    start = new Date(date); start.setHours(0, 0, 0, 0);
    end   = new Date(date); end.setHours(23, 59, 59, 999);
  }

  const trips = await Trip.findAll({
    where: { departure_time: { [Op.between]: [start, end] } },
    include: [
      { model: BusModel, attributes: ['id', 'bus_number', 'plate_number'] },
      { model: Route, attributes: ['id', 'origin', 'destination'] },
      { model: User, as: 'driver', attributes: ['id', 'first_name', 'last_name'] },
      { model: User, as: 'conductor', attributes: ['id', 'first_name', 'last_name'] },
    ],
    order: [['departure_time', 'ASC']],
  });
  return res.json(trips);
};

// POST /api/buses/trips
const createTrip = async (req, res) => {
  const { bus_id, route_id, driver_id, conductor_id, trip_number, departure_time } = req.body;
  const trip = await Trip.create({ bus_id, route_id, driver_id, conductor_id, trip_number, departure_time, status: 'scheduled' });
  return res.status(201).json(trip);
};

// DELETE /api/buses/trips/:id
const deleteTrip = async (req, res) => {
  const trip = await Trip.findByPk(req.params.id);
  if (!trip) return res.status(404).json({ message: 'Trip not found.' });
  await trip.destroy();
  return res.status(204).send();
};

// GET /api/buses/routes
const getRoutes = async (req, res) => {
  const routes = await Route.findAll({ order: [['origin', 'ASC']] });
  return res.json(routes);
};

// GET /api/buses/:id/crew-history
const getCrewHistory = async (req, res) => {
  const history = await BusCrewHistory.findAll({
    where: { bus_id: req.params.id },
    include: [
      { model: User, as: 'driver', attributes: ['id', 'first_name', 'last_name', 'employee_id'] },
      { model: User, as: 'conductor', attributes: ['id', 'first_name', 'last_name', 'employee_id'] },
    ],
    order: [['assigned_at', 'DESC']],
  });
  return res.json(history);
};

module.exports = { getBuses, createBus, updateBus, deleteBus, assignCrew, getCrewHistory, getTrips, createTrip, deleteTrip, getRoutes };
