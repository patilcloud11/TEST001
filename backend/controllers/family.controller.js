/**
 * Family Controller
 * Manage family profile, members, and budget settings
 */

const { docClient, TABLES } = require('../config/dynamodb');
const { GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// ─── GET FAMILY ───────────────────────────────────────────────────────────────
const getFamily = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })
    );
    if (!family) return res.status(404).json({ error: 'Family not found' });

    // Fetch member details
    const memberDetails = await Promise.all(
      (family.members || []).map(async (uid) => {
        const { Item: u } = await docClient.send(
          new GetCommand({ TableName: TABLES.USERS, Key: { userId: uid } })
        );
        return u ? { userId: u.userId, name: u.name, email: u.email, role: u.role } : null;
      })
    );

    res.json({ family: { ...family, memberDetails: memberDetails.filter(Boolean) } });
  } catch (err) {
    console.error('Get family error:', err);
    res.status(500).json({ error: 'Failed to fetch family' });
  }
};

// ─── UPDATE FAMILY ────────────────────────────────────────────────────────────
const updateFamily = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { name, monthlyBudget, currency } = req.body;

    let updateExpr = 'SET updatedAt = :now';
    const exprVals = { ':now': new Date().toISOString() };
    const exprNames = {};

    if (name) { updateExpr += ', #n = :name'; exprVals[':name'] = name; exprNames['#n'] = 'name'; }
    if (monthlyBudget) { updateExpr += ', monthlyBudget = :budget'; exprVals[':budget'] = parseFloat(monthlyBudget); }
    if (currency) { updateExpr += ', currency = :currency'; exprVals[':currency'] = currency; }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.FAMILIES,
        Key: { familyId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(Object.keys(exprNames).length && { ExpressionAttributeNames: exprNames }),
      })
    );

    res.json({ message: 'Family updated' });
  } catch (err) {
    console.error('Update family error:', err);
    res.status(500).json({ error: 'Failed to update family' });
  }
};

// ─── GET DASHBOARD SUMMARY ────────────────────────────────────────────────────
const getDashboardSummary = async (req, res) => {
  try {
    const { familyId } = req.user;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [familyRes, expensesRes, billsRes, investmentsRes] = await Promise.all([
      docClient.send(new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId } })),
      docClient.send(new QueryCommand({
        TableName: TABLES.EXPENSES,
        IndexName: 'family-month-index',
        KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
        ExpressionAttributeValues: { ':fid': familyId, ':ym': currentMonth },
      })),
      docClient.send(new QueryCommand({
        TableName: TABLES.BILLS,
        KeyConditionExpression: 'familyId = :fid',
        ExpressionAttributeValues: { ':fid': familyId },
        FilterExpression: 'isPaid = :false',
        ExpressionAttributeValues: { ':fid': familyId, ':false': false },
      })),
      docClient.send(new QueryCommand({
        TableName: TABLES.INVESTMENTS,
        KeyConditionExpression: 'familyId = :fid',
        ExpressionAttributeValues: { ':fid': familyId },
      })),
    ]);

    const family = familyRes.Item;
    const expenses = expensesRes.Items || [];
    const unpaidBills = billsRes.Items || [];
    const investments = investmentsRes.Items || [];

    const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
    const categoryTotals = {};
    expenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const totalInvested = investments.reduce((s, i) => s + i.principal, 0);
    const unpaidBillTotal = unpaidBills.reduce((s, b) => s + b.amount, 0);

    // Recent 5 transactions
    const recentTransactions = [...expenses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(e => ({ ...e, type: 'expense' }));

    // Due soon bills (next 7 days)
    const today = new Date();
    const dueSoonBills = unpaidBills.filter(b => {
      const days = Math.ceil((new Date(b.dueDate) - today) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    });

    res.json({
      family: { name: family?.name, monthlyBudget: family?.monthlyBudget || 0 },
      currentMonth: {
        yearMonth: currentMonth,
        totalSpent: Math.round(totalSpent * 100) / 100,
        budget: family?.monthlyBudget || 0,
        remaining: Math.round(((family?.monthlyBudget || 0) - totalSpent) * 100) / 100,
        usedPercent: family?.monthlyBudget
          ? Math.round((totalSpent / family.monthlyBudget) * 100) : 0,
        categoryBreakdown: Object.entries(categoryTotals)
          .map(([cat, amt]) => ({ category: cat, amount: Math.round(amt * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount),
        transactionCount: expenses.length,
      },
      investments: {
        count: investments.length,
        totalPrincipal: Math.round(totalInvested * 100) / 100,
      },
      bills: {
        unpaidCount: unpaidBills.length,
        totalUnpaid: Math.round(unpaidBillTotal * 100) / 100,
        dueSoonCount: dueSoonBills.length,
      },
      recentTransactions,
      alerts: [
        ...(dueSoonBills.map(b => ({
          type: 'bill',
          severity: 'warning',
          message: `${b.name} due in ${Math.ceil((new Date(b.dueDate) - today) / 86400000)} days (₹${b.amount})`,
        }))),
        ...((family?.monthlyBudget && totalSpent > family.monthlyBudget * 0.85) ? [{
          type: 'budget',
          severity: totalSpent > family.monthlyBudget ? 'error' : 'warning',
          message: totalSpent > family.monthlyBudget
            ? `⚠️ Budget exceeded by ₹${Math.round(totalSpent - family.monthlyBudget)}`
            : `Budget at ${Math.round((totalSpent / family.monthlyBudget) * 100)}% — watch spending`,
        }] : []),
      ],
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

module.exports = { getFamily, updateFamily, getDashboardSummary };
