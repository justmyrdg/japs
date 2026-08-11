const express = require("express");
const router = express.Router();
const {
  getFareSettings,
  updateFareSettings,
} = require("../controllers/fareSettingsController");
const { authenticate, authorize } = require("../middleware/auth");

// GET is accessible by owner, secretary, and conductor (for ticketing)
router.get("/", authenticate, authorize("owner", "secretary", "conductor"), getFareSettings);

// PUT is owner/secretary only
router.put("/", authenticate, authorize("owner", "secretary"), updateFareSettings);

module.exports = router;
