const express = require('express');
const router = express.Router();
const { getFamily, updateFamily, getDashboardSummary } = require('../controllers/family.controller');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/', getFamily);
router.put('/', requireAdmin, updateFamily);
router.get('/dashboard', getDashboardSummary);

module.exports = router;
