/**
 * Expense Controller
 * Full CRUD for family expenses with monthly grouping
 */

const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const {
  PutCommand, GetCommand, UpdateCommand, DeleteCommand,
  QueryCommand, ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

// ─── EXPENSE CATEGORIES ───────────────────────────────────────────────────────
const VALID_CATEGORIES = [
  'grocery', 'food_dining', 'transportation', 'utilities',
  'entertainment', 'healthcare', 'education', 'clothing',
  'personal_care', 'rent', 'other',
];

// ─── ADD EXPENSE ──────────────────────────────────────────────────────────────
const addExpense = async (req, res) => {
  try {
    const { amount, category, description, date, paidBy, tags } = req.body;
    const { familyId } = req.user;

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category', validCategories: VALID_CATEGORIES });
    }

    const expenseDate = date ? new Date(date) : new Date();
    const yearMonth = `${expenseDate.getFullYear()}-${String(expenseDate.getMonth() + 1).padStart(2, '0')}`;
    const expenseId = `${Date.now()}-${uuidv4().slice(0, 8)}`;

    const expense = {
      familyId,
      expenseId,
      amount: parseFloat(amount),
      category,
      description: description || '',
      date: expenseDate.toISOString(),
      yearMonth,
      paidBy: paidBy || req.user.userId,
      paidByName: req.user.name,
      tags: tags || [],
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.EXPENSES, Item: expense }));

    res.status(201).json({ message: 'Expense added', expense });
  } catch (err) {
    console.error('Add expense error:', err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
};

// ─── GET EXPENSES (with filters) ──────────────────────────────────────────────
const getExpenses = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { month, year, category, limit = 50, lastKey } = req.query;

    let queryParams;

    if (month && year) {
      // Use family-month-index GSI for efficient monthly queries
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      queryParams = {
        TableName: TABLES.EXPENSES,
        IndexName: 'family-month-index',
        KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
        ExpressionAttributeValues: { ':fid': familyId, ':ym': yearMonth },
        ScanIndexForward: false, // newest first
        Limit: parseInt(limit),
      };
    } else {
      // Query all expenses for the family
      queryParams = {
        TableName: TABLES.EXPENSES,
        KeyConditionExpression: 'familyId = :fid',
        ExpressionAttributeValues: { ':fid': familyId },
        ScanIndexForward: false,
        Limit: parseInt(limit),
      };
    }

    // Category filter (post-query filter)
    if (category) {
      queryParams.FilterExpression = 'category = :cat';
      queryParams.ExpressionAttributeValues[':cat'] = category;
    }

    if (lastKey) {
      queryParams.ExclusiveStartKey = JSON.parse(Buffer.from(lastKey, 'base64').toString());
    }

    const { Items: expenses, LastEvaluatedKey } = await docClient.send(new QueryCommand(queryParams));

    res.json({
      expenses: expenses || [],
      nextKey: LastEvaluatedKey
        ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64')
        : null,
      count: expenses?.length || 0,
    });
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

// ─── GET MONTHLY SUMMARY ──────────────────────────────────────────────────────
const getMonthlySummary = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { year, month } = req.params;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    const { Items: expenses } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.EXPENSES,
        IndexName: 'family-month-index',
        KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
        ExpressionAttributeValues: { ':fid': familyId, ':ym': yearMonth },
      })
    );

    // Aggregate by category
    const categoryTotals = {};
    let totalSpent = 0;

    (expenses || []).forEach((exp) => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
      totalSpent += exp.amount;
    });

    // Fetch family budget for comparison
    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })
    );

    const categoryBreakdown = Object.entries(categoryTotals).map(([cat, amt]) => ({
      category: cat,
      amount: Math.round(amt * 100) / 100,
      percentage: totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0,
    })).sort((a, b) => b.amount - a.amount);

    res.json({
      yearMonth,
      totalSpent: Math.round(totalSpent * 100) / 100,
      monthlyBudget: family?.monthlyBudget || 0,
      budgetRemaining: (family?.monthlyBudget || 0) - totalSpent,
      budgetUsedPercent: family?.monthlyBudget
        ? Math.round((totalSpent / family.monthlyBudget) * 100) : 0,
      categoryBreakdown,
      transactionCount: expenses?.length || 0,
    });
  } catch (err) {
    console.error('Monthly summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
};

// ─── GET TREND (last N months) ────────────────────────────────────────────────
const getMonthlyTrend = async (req, res) => {
  try {
    const { familyId } = req.user;
    const months = parseInt(req.query.months) || 6;
    const trend = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('default', { month: 'short', year: '2-digit' });

      const { Items } = await docClient.send(
        new QueryCommand({
          TableName: TABLES.EXPENSES,
          IndexName: 'family-month-index',
          KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
          ExpressionAttributeValues: { ':fid': familyId, ':ym': yearMonth },
        })
      );

      const total = (Items || []).reduce((sum, e) => sum + e.amount, 0);
      trend.push({ yearMonth, month: monthLabel, total: Math.round(total * 100) / 100 });
    }

    res.json({ trend, months });
  } catch (err) {
    console.error('Trend error:', err);
    res.status(500).json({ error: 'Failed to fetch trend' });
  }
};

// ─── UPDATE EXPENSE ───────────────────────────────────────────────────────────
const updateExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { amount, category, description, date } = req.body;
    const { familyId } = req.user;

    const updates = { updatedAt: new Date().toISOString() };
    let updateExpr = 'SET updatedAt = :updatedAt';
    const exprVals = { ':updatedAt': updates.updatedAt };
    const exprNames = {};

    if (amount !== undefined) { updateExpr += ', amount = :amount'; exprVals[':amount'] = parseFloat(amount); }
    if (category) { updateExpr += ', category = :cat'; exprVals[':cat'] = category; }
    if (description !== undefined) { updateExpr += ', description = :desc'; exprVals[':desc'] = description; }
    if (date) {
      const d = new Date(date);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      updateExpr += ', #date = :date, yearMonth = :ym';
      exprVals[':date'] = d.toISOString();
      exprVals[':ym'] = ym;
      exprNames['#date'] = 'date';
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.EXPENSES,
        Key: { familyId, expenseId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(Object.keys(exprNames).length && { ExpressionAttributeNames: exprNames }),
      })
    );

    res.json({ message: 'Expense updated', expenseId });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

// ─── DELETE EXPENSE ───────────────────────────────────────────────────────────
const deleteExpense = async (req, res) => {
  try {
    const { expenseId } = req.params;
    const { familyId } = req.user;

    await docClient.send(
      new DeleteCommand({ TableName: TABLES.EXPENSES, Key: { familyId, expenseId } })
    );

    res.json({ message: 'Expense deleted', expenseId });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

module.exports = { addExpense, getExpenses, getMonthlySummary, getMonthlyTrend, updateExpense, deleteExpense };
