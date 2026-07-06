const express = require('express');
const router = express.Router();
const { getAssignedTrips } = require('../controllers/driverController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('driver'));

router.get('/trips', getAssignedTrips);

module.exports = router;
