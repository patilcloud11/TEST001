const express = require('express');
const router = express.Router();
const { addBill, getBills, markBillPaid, deleteBill } = require('../controllers/bill.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.post('/', addBill);
router.get('/', getBills);
router.put('/:billId/pay', markBillPaid);
router.delete('/:billId', deleteBill);

module.exports = router;
