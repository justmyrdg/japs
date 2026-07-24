const express = require('express');
const router = express.Router();
const { getAssignedTrips, getRemittances } = require('../controllers/driverController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('driver'));

router.get('/trips', getAssignedTrips);
router.get('/remittances', getRemittances);

module.exports = router;
