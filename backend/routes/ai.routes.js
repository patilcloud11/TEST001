const express = require('express');
const router = express.Router();
const {
  getFinancialInsights,
  getSpendingAnalysis,
  getBudgetRecommendations,
  getInvestmentSuggestions,
} = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.use(authenticate);
router.get('/insights', getFinancialInsights);
router.post('/analyze', getSpendingAnalysis);
router.post('/budget-recommendations', getBudgetRecommendations);
router.get('/investment-suggestions', getInvestmentSuggestions);

module.exports = router;
