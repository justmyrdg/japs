const { FareSettings } = require("../models");

// GET /api/fare-settings
const getFareSettings = async (req, res) => {
  // Always return the latest record (id = 1, or most recent)
  let settings = await FareSettings.findOne({ order: [["id", "DESC"]] });
  if (!settings) {
    // Create default if none exists
    const today = new Date().toISOString().slice(0, 10);
    settings = await FareSettings.create({
      minimum_fare: 50.0,
      base_distance_km: 5.0,
      rate_per_km: 2.0,
      regular_multiplier: 100,
      student_multiplier: 80,
      senior_citizen_multiplier: 80,
      pwd_multiplier: 80,
      discounted_multiplier: 80,
      effective_date: today,
    });
  }
  return res.json(settings);
};

// PUT /api/fare-settings
const updateFareSettings = async (req, res) => {
  const {
    minimum_fare,
    base_distance_km,
    rate_per_km,
    regular_multiplier,
    student_multiplier,
    senior_citizen_multiplier,
    pwd_multiplier,
    discounted_multiplier,
    effective_date,
  } = req.body;

  let settings = await FareSettings.findOne({ order: [["id", "DESC"]] });
  if (!settings) {
    // Create new
    settings = await FareSettings.create(req.body);
  } else {
    // Update existing
    await settings.update({
      minimum_fare,
      base_distance_km,
      rate_per_km,
      regular_multiplier,
      student_multiplier,
      senior_citizen_multiplier,
      pwd_multiplier,
      discounted_multiplier,
      effective_date,
    });
  }
  return res.json(settings);
};

module.exports = { getFareSettings, updateFareSettings };
