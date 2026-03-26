const express = require('express');
const router = express.Router();
const { addInvestment, getInvestments, updateInvestment, deleteInvestment } = require('../controllers/investment.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.post('/', addInvestment);
router.get('/', getInvestments);
router.put('/:investmentId', updateInvestment);
router.delete('/:investmentId', deleteInvestment);

module.exports = router;
