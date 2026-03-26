/**
 * AI Controller
 * Integrates Groq AI for financial insights, spending analysis,
 * budget recommendations, and market predictions
 */

const Groq = require('groq-sdk');
const { docClient, TABLES } = require('../config/dynamodb');
const { GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = process.env.GROQ_MODEL || 'llama3-70b-8192';

// ─── Helper: Fetch family's recent financial data ─────────────────────────────
async function gatherFamilyFinancialData(familyId, userId) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  const [currentExpenses, prevExpenses, bills, investments, family] = await Promise.all([
    docClient.send(new QueryCommand({
      TableName: TABLES.EXPENSES,
      IndexName: 'family-month-index',
      KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
      ExpressionAttributeValues: { ':fid': familyId, ':ym': currentMonth },
    })),
    docClient.send(new QueryCommand({
      TableName: TABLES.EXPENSES,
      IndexName: 'family-month-index',
      KeyConditionExpression: 'familyId = :fid AND yearMonth = :ym',
      ExpressionAttributeValues: { ':fid': familyId, ':ym': prevMonth },
    })),
    docClient.send(new QueryCommand({
      TableName: TABLES.BILLS,
      KeyConditionExpression: 'familyId = :fid',
      ExpressionAttributeValues: { ':fid': familyId },
    })),
    docClient.send(new QueryCommand({
      TableName: TABLES.INVESTMENTS,
      KeyConditionExpression: 'familyId = :fid',
      ExpressionAttributeValues: { ':fid': familyId },
    })),
    docClient.send(new GetCommand({
      TableName: TABLES.FAMILIES,
      Key: { familyId },
    })),
  ]);

  // Aggregate category spending
  const aggregateByCategory = (items) => {
    const agg = {};
    (items || []).forEach(e => {
      agg[e.category] = (agg[e.category] || 0) + e.amount;
    });
    return agg;
  };

  const currExpItems = currentExpenses.Items || [];
  const prevExpItems = prevExpenses.Items || [];

  return {
    monthlyBudget: family.Item?.monthlyBudget || 50000,
    currentMonth: {
      yearMonth: currentMonth,
      total: currExpItems.reduce((s, e) => s + e.amount, 0),
      byCategory: aggregateByCategory(currExpItems),
      transactionCount: currExpItems.length,
    },
    previousMonth: {
      yearMonth: prevMonth,
      total: prevExpItems.reduce((s, e) => s + e.amount, 0),
      byCategory: aggregateByCategory(prevExpItems),
    },
    bills: {
      total: (bills.Items || []).length,
      unpaid: (bills.Items || []).filter(b => !b.isPaid).length,
      totalUnpaidAmount: (bills.Items || []).filter(b => !b.isPaid).reduce((s, b) => s + b.amount, 0),
    },
    investments: {
      count: (investments.Items || []).length,
      totalPrincipal: (investments.Items || []).reduce((s, i) => s + i.principal, 0),
      types: [...new Set((investments.Items || []).map(i => i.type))],
    },
  };
}

// ─── AI INSIGHTS ──────────────────────────────────────────────────────────────
const getFinancialInsights = async (req, res) => {
  try {
    const { familyId } = req.user;
    const data = await gatherFamilyFinancialData(familyId, req.user.userId);

    const categoryPercents = Object.entries(data.currentMonth.byCategory)
      .map(([cat, amt]) => `${cat}: ₹${amt.toFixed(0)} (${((amt / data.currentMonth.total) * 100).toFixed(1)}%)`)
      .join(', ');

    const prompt = `You are an expert Indian family financial advisor. Analyze the following family's financial data and provide actionable insights in JSON format.

FINANCIAL DATA:
- Monthly Budget: ₹${data.monthlyBudget}
- Current Month Spending: ₹${data.currentMonth.total.toFixed(0)}
- Budget Used: ${((data.currentMonth.total / data.monthlyBudget) * 100).toFixed(1)}%
- Category Breakdown: ${categoryPercents || 'No expenses yet'}
- Previous Month Total: ₹${data.previousMonth.total.toFixed(0)}
- Month-over-Month Change: ${data.currentMonth.total > 0 ? ((data.currentMonth.total - data.previousMonth.total) / (data.previousMonth.total || 1) * 100).toFixed(1) : 0}%
- Unpaid Bills: ${data.bills.unpaid} bills totaling ₹${data.bills.totalUnpaidAmount.toFixed(0)}
- Investments: ₹${data.investments.totalPrincipal.toFixed(0)} across ${data.investments.count} instruments (${data.investments.types.join(', ') || 'none'})

Respond ONLY with valid JSON (no markdown, no backticks) in this exact structure:
{
  "healthScore": <number 1-100>,
  "healthLabel": "<Excellent|Good|Fair|Poor>",
  "summary": "<2 sentence overview>",
  "insights": [
    {"type": "warning|info|success|tip", "title": "...", "description": "...", "impact": "high|medium|low"}
  ],
  "recommendations": [
    {"priority": 1, "action": "...", "reason": "...", "estimatedSaving": "..."}
  ],
  "overspendingAlerts": [
    {"category": "...", "amount": ..., "suggestion": "..."}
  ],
  "savingsTips": ["tip1", "tip2", "tip3"]
}`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 1500,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback parse attempt — strip any accidental markdown
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    res.json({ insights: parsed, dataSnapshot: data });
  } catch (err) {
    console.error('AI insights error:', err);
    res.status(500).json({ error: 'Failed to generate insights', detail: err.message });
  }
};

// ─── SPENDING ANALYSIS ────────────────────────────────────────────────────────
const getSpendingAnalysis = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const data = await gatherFamilyFinancialData(familyId, req.user.userId);

    const prompt = `You are a friendly Indian family financial advisor. Answer the following question about the family's finances.

FINANCIAL CONTEXT:
- Budget: ₹${data.monthlyBudget}/month
- This month spent: ₹${data.currentMonth.total.toFixed(0)}
- Category spending: ${JSON.stringify(data.currentMonth.byCategory)}
- Previous month: ₹${data.previousMonth.total.toFixed(0)}
- Investments: ₹${data.investments.totalPrincipal} in ${data.investments.types.join(', ')}
- Unpaid bills: ${data.bills.unpaid} (₹${data.bills.totalUnpaidAmount})

USER QUESTION: ${question}

Provide a helpful, specific, and actionable answer in 3-5 sentences. Use Indian Rupee (₹) notation. Be conversational and encouraging.`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 500,
    });

    res.json({
      question,
      answer: completion.choices[0]?.message?.content,
      tokensUsed: completion.usage?.total_tokens,
    });
  } catch (err) {
    console.error('Spending analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze spending' });
  }
};

// ─── BUDGET RECOMMENDATIONS ───────────────────────────────────────────────────
const getBudgetRecommendations = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { income, familySize } = req.body;

    const data = await gatherFamilyFinancialData(familyId, req.user.userId);

    const prompt = `You are an expert Indian financial planner. Create a personalized monthly budget allocation.

INPUT:
- Monthly household income: ₹${income || data.monthlyBudget * 1.5}
- Family size: ${familySize || 4} members
- Current monthly spending: ₹${data.currentMonth.total.toFixed(0)}
- Current categories: ${JSON.stringify(data.currentMonth.byCategory)}
- Current investments: ₹${data.investments.totalPrincipal} total

Respond ONLY with valid JSON (no markdown):
{
  "budgetPlan": {
    "income": <number>,
    "allocations": [
      {"category": "...", "recommended": <amount>, "current": <amount_or_null>, "percentage": <pct>}
    ],
    "totalAllocated": <number>,
    "savings": <amount>,
    "savingsPercent": <pct>
  },
  "strategy": "<name e.g. 50/30/20 Rule>",
  "explanation": "<2-3 sentences>",
  "keyActions": ["action1", "action2", "action3"]
}`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    console.error('Budget recommendations error:', err);
    res.status(500).json({ error: 'Failed to generate budget recommendations' });
  }
};

// ─── INVESTMENT SUGGESTIONS ───────────────────────────────────────────────────
const getInvestmentSuggestions = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { riskProfile, monthlySavings } = req.query;

    const data = await gatherFamilyFinancialData(familyId, req.user.userId);

    const prompt = `You are a SEBI-registered financial advisor. Suggest investment options for an Indian family.

FAMILY PROFILE:
- Monthly surplus/savings: ₹${monthlySavings || Math.max(0, data.monthlyBudget - data.currentMonth.total).toFixed(0)}
- Risk profile: ${riskProfile || 'moderate'}
- Current investments: ${JSON.stringify(data.investments.types)}
- Total invested: ₹${data.investments.totalPrincipal}

Respond ONLY with valid JSON (no markdown):
{
  "suggestions": [
    {
      "name": "...",
      "type": "SIP|LIC|FD|PPF|NPS|Gold|Stocks|Other",
      "recommendedAmount": <monthly_amount>,
      "expectedReturn": "<X-Y% p.a.>",
      "riskLevel": "Low|Medium|High",
      "horizon": "<time period>",
      "why": "<reason>",
      "howToStart": "<brief steps>"
    }
  ],
  "portfolioAdvice": "<2-3 sentence overall advice>",
  "disclaimer": "Investments are subject to market risks."
}`;

    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 1200,
    });

    const rawText = completion.choices[0]?.message?.content || '{}';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    res.json(parsed);
  } catch (err) {
    console.error('Investment suggestions error:', err);
    res.status(500).json({ error: 'Failed to generate investment suggestions' });
  }
};

module.exports = {
  getFinancialInsights,
  getSpendingAnalysis,
  getBudgetRecommendations,
  getInvestmentSuggestions,
};
