/**
 * Investment Controller
 * Tracks SIP, LIC, FD, savings, and computes returns
 */

const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const INVESTMENT_TYPES = ['sip', 'lic', 'fd', 'ppf', 'nps', 'stocks', 'gold', 'savings', 'rd', 'other'];

// ─── Calculate current value using CAGR ──────────────────────────────────────
const calcCurrentValue = (principal, annualReturnPct, startDate) => {
  const years = (Date.now() - new Date(startDate)) / (1000 * 60 * 60 * 24 * 365);
  return principal * Math.pow(1 + annualReturnPct / 100, years);
};

// ─── ADD INVESTMENT ───────────────────────────────────────────────────────────
const addInvestment = async (req, res) => {
  try {
    const {
      name, type, principal, monthlyAmount, expectedReturnPct,
      startDate, maturityDate, policyNumber, notes,
    } = req.body;
    const { familyId } = req.user;

    const investmentId = `inv-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const investment = {
      familyId,
      investmentId,
      name,
      type: INVESTMENT_TYPES.includes(type) ? type : 'other',
      principal: parseFloat(principal),
      monthlyAmount: monthlyAmount ? parseFloat(monthlyAmount) : null,
      expectedReturnPct: parseFloat(expectedReturnPct) || 10,
      startDate: startDate || new Date().toISOString().split('T')[0],
      maturityDate: maturityDate || null,
      policyNumber: policyNumber || null,
      notes: notes || '',
      isActive: true,
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.INVESTMENTS, Item: investment }));
    res.status(201).json({ message: 'Investment added', investment });
  } catch (err) {
    console.error('Add investment error:', err);
    res.status(500).json({ error: 'Failed to add investment' });
  }
};

// ─── GET INVESTMENTS ──────────────────────────────────────────────────────────
const getInvestments = async (req, res) => {
  try {
    const { familyId } = req.user;

    const { Items: investments } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.INVESTMENTS,
        KeyConditionExpression: 'familyId = :fid',
        ExpressionAttributeValues: { ':fid': familyId },
      })
    );

    // Enrich with calculated returns
    const enriched = (investments || []).map((inv) => {
      const currentValue = calcCurrentValue(
        inv.principal, inv.expectedReturnPct, inv.startDate
      );
      const totalReturns = currentValue - inv.principal;
      const returnPct = inv.principal > 0 ? (totalReturns / inv.principal) * 100 : 0;

      const today = new Date();
      const maturity = inv.maturityDate ? new Date(inv.maturityDate) : null;
      const daysToMaturity = maturity ? Math.ceil((maturity - today) / (1000 * 60 * 60 * 24)) : null;

      return {
        ...inv,
        currentValue: Math.round(currentValue * 100) / 100,
        totalReturns: Math.round(totalReturns * 100) / 100,
        returnPct: Math.round(returnPct * 100) / 100,
        daysToMaturity,
        isMatured: maturity ? today >= maturity : false,
      };
    });

    const totalPrincipal = enriched.reduce((s, i) => s + i.principal, 0);
    const totalCurrentValue = enriched.reduce((s, i) => s + i.currentValue, 0);
    const totalReturns = totalCurrentValue - totalPrincipal;

    res.json({
      investments: enriched,
      portfolio: {
        totalPrincipal: Math.round(totalPrincipal * 100) / 100,
        totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
        totalReturns: Math.round(totalReturns * 100) / 100,
        overallReturnPct: totalPrincipal > 0
          ? Math.round((totalReturns / totalPrincipal) * 10000) / 100 : 0,
      },
    });
  } catch (err) {
    console.error('Get investments error:', err);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
};

// ─── UPDATE INVESTMENT ────────────────────────────────────────────────────────
const updateInvestment = async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { familyId } = req.user;
    const { name, principal, monthlyAmount, expectedReturnPct, notes } = req.body;

    let updateExpr = 'SET updatedAt = :now';
    const exprVals = { ':now': new Date().toISOString() };

    if (name) { updateExpr += ', #n = :name'; exprVals[':name'] = name; }
    if (principal) { updateExpr += ', principal = :p'; exprVals[':p'] = parseFloat(principal); }
    if (monthlyAmount) { updateExpr += ', monthlyAmount = :ma'; exprVals[':ma'] = parseFloat(monthlyAmount); }
    if (expectedReturnPct) { updateExpr += ', expectedReturnPct = :ret'; exprVals[':ret'] = parseFloat(expectedReturnPct); }
    if (notes !== undefined) { updateExpr += ', notes = :notes'; exprVals[':notes'] = notes; }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.INVESTMENTS,
        Key: { familyId, investmentId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(name && { ExpressionAttributeNames: { '#n': 'name' } }),
      })
    );

    res.json({ message: 'Investment updated', investmentId });
  } catch (err) {
    console.error('Update investment error:', err);
    res.status(500).json({ error: 'Failed to update investment' });
  }
};

// ─── DELETE INVESTMENT ────────────────────────────────────────────────────────
const deleteInvestment = async (req, res) => {
  try {
    const { investmentId } = req.params;
    const { familyId } = req.user;
    await docClient.send(
      new DeleteCommand({ TableName: TABLES.INVESTMENTS, Key: { familyId, investmentId } })
    );
    res.json({ message: 'Investment deleted' });
  } catch (err) {
    console.error('Delete investment error:', err);
    res.status(500).json({ error: 'Failed to delete investment' });
  }
};

module.exports = { addInvestment, getInvestments, updateInvestment, deleteInvestment };
