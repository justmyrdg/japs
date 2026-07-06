const express = require("express");
const {
  getStats,
  getRemittances,
  getRemittanceById,
  getDrivers,
  getConductors,
  getTrips,
  createRemittance,
  approveRemittance,
  rejectRemittance,
} = require("../controllers/auditTellerController");
const { getBuses } = require("../controllers/busController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);
router.use(authorize("audit_teller"));

router.get("/stats", getStats);
router.get("/remittances", getRemittances);
router.get("/remittances/:id", getRemittanceById);
router.get("/buses", getBuses);
router.get("/drivers", getDrivers);
router.get("/conductors", getConductors);
router.get("/trips", getTrips);
router.post("/remittances", createRemittance);
router.put("/remittances/:id/approve", approveRemittance);
router.put("/remittances/:id/reject", rejectRemittance);

module.exports = router;
