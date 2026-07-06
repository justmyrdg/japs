const { Route } = require("../models");

// GET /api/routes
const getRoutes = async (req, res) => {
  const routes = await Route.findAll({ order: [["origin", "ASC"]] });
  return res.json(routes);
};

// POST /api/routes
const createRoute = async (req, res) => {
  const { origin, destination, distance_km } = req.body;
  if (!origin || !destination)
    return res
      .status(400)
      .json({ message: "Origin and destination are required." });
  const route = await Route.create({ origin, destination, distance_km });
  return res.status(201).json(route);
};

// PUT /api/routes/:id
const updateRoute = async (req, res) => {
  const route = await Route.findByPk(req.params.id);
  if (!route) return res.status(404).json({ message: "Route not found." });
  const { origin, destination, distance_km } = req.body;
  await route.update({ origin, destination, distance_km });
  return res.json(route);
};

// DELETE /api/routes/:id
const deleteRoute = async (req, res) => {
  const route = await Route.findByPk(req.params.id);
  if (!route) return res.status(404).json({ message: "Route not found." });
  await route.destroy();
  return res.status(204).send();
};

module.exports = { getRoutes, createRoute, updateRoute, deleteRoute };
