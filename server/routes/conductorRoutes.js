const express = require("express");
const router = express.Router();
const {
  getAssignedTrips,
  updateTripStatus,
  getTripPassengerCounts,
  savePassengerCounts,
  getRouteStopsForConductor,
  printTicket,
  getTickets,
  submitRemittance,
  getRemittances,
} = require("../controllers/conductorController");
const { authenticate, authorize } = require("../middleware/auth");

router.use(authenticate, authorize("conductor"));

router.get("/trips", getAssignedTrips);
router.put("/trips/:id/status", updateTripStatus);
router.get("/trips/:id/passenger-counts", getTripPassengerCounts);
router.post("/trips/:id/passenger-counts", savePassengerCounts);
router.get("/routes/:routeId/stops", getRouteStopsForConductor);
router.post("/trips/:id/tickets", printTicket);
router.get("/tickets", getTickets);
router.get("/remittances", getRemittances);
router.post("/remittances", submitRemittance);

module.exports = router;
