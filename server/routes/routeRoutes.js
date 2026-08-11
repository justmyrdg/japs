const express = require("express");
const router = express.Router();
const {
  getRoutes,
  createRoute,
  updateRoute,
  deleteRoute,
  getRouteStops,
  createRouteStop,
  updateRouteStop,
  deleteRouteStop,
} = require("../controllers/routeController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate, authorize("owner", "secretary"));

router.get("/", getRoutes);
router.post("/", createRoute);
router.put("/:id", updateRoute);
router.delete("/:id", deleteRoute);

router.get("/:routeId/stops", getRouteStops);
router.post("/:routeId/stops", createRouteStop);
router.put("/:routeId/stops/:stopId", updateRouteStop);
router.delete("/:routeId/stops/:stopId", deleteRouteStop);

module.exports = router;
