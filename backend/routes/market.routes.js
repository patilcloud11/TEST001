const express = require('express');
const router = express.Router();
const { getCommodityPrices, getMarketOverview, getMarketPredictions } = require('../controllers/market.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/commodities', getCommodityPrices);
router.get('/overview', getMarketOverview);
router.get('/predictions', getMarketPredictions);

module.exports = router;
