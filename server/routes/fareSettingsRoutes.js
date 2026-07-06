const express = require("express");
const router = express.Router();
const {
  getFareSettings,
  updateFareSettings,
} = require("../controllers/fareSettingsController");
const { authenticate, authorize } = require("../middleware/auth");

// GET is accessible by owner and conductor (for ticketing)
router.get("/", authenticate, authorize("owner", "conductor"), getFareSettings);

// PUT is owner-only
router.put("/", authenticate, authorize("owner"), updateFareSettings);

module.exports = router;
