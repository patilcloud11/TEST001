// ── expense.routes.js ────────────────────────────────────────────────────────
const express = require('express');
const expRouter = express.Router();
const { addExpense, getExpenses, getMonthlySummary, getMonthlyTrend, updateExpense, deleteExpense } = require('../controllers/expense.controller');
const { authenticate } = require('../middleware/auth.middleware');

expRouter.use(authenticate);
expRouter.post('/', addExpense);
expRouter.get('/', getExpenses);
expRouter.get('/trend', getMonthlyTrend);
expRouter.get('/summary/:year/:month', getMonthlySummary);
expRouter.put('/:expenseId', updateExpense);
expRouter.delete('/:expenseId', deleteExpense);

module.exports = expRouter;
