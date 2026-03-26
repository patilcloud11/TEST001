/**
 * Bills Controller
 * Manages recurring bills: electricity, water, LPG, rent, etc.
 */

const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const BILL_TYPES = ['electricity', 'water', 'lpg', 'rent', 'internet', 'mobile', 'insurance', 'emi', 'other'];

// ─── ADD BILL ─────────────────────────────────────────────────────────────────
const addBill = async (req, res) => {
  try {
    const { name, type, amount, dueDate, isRecurring, recurringDay, notes } = req.body;
    const { familyId } = req.user;

    const billId = `bill-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const bill = {
      familyId,
      billId,
      name,
      type: BILL_TYPES.includes(type) ? type : 'other',
      amount: parseFloat(amount),
      dueDate, // ISO string e.g. "2024-07-15"
      isPaid: false,
      isRecurring: isRecurring || false,
      recurringDay: recurringDay || null, // Day of month (1-31)
      notes: notes || '',
      createdBy: req.user.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.BILLS, Item: bill }));
    res.status(201).json({ message: 'Bill added', bill });
  } catch (err) {
    console.error('Add bill error:', err);
    res.status(500).json({ error: 'Failed to add bill' });
  }
};

// ─── GET BILLS ────────────────────────────────────────────────────────────────
const getBills = async (req, res) => {
  try {
    const { familyId } = req.user;
    const { status } = req.query; // 'paid' | 'unpaid'

    const params = {
      TableName: TABLES.BILLS,
      KeyConditionExpression: 'familyId = :fid',
      ExpressionAttributeValues: { ':fid': familyId },
      ScanIndexForward: true,
    };

    if (status === 'unpaid') {
      params.FilterExpression = 'isPaid = :false';
      params.ExpressionAttributeValues[':false'] = false;
    } else if (status === 'paid') {
      params.FilterExpression = 'isPaid = :true';
      params.ExpressionAttributeValues[':true'] = true;
    }

    const { Items: bills } = await docClient.send(new QueryCommand(params));

    // Detect upcoming / overdue
    const today = new Date();
    const enriched = (bills || []).map((b) => {
      const due = new Date(b.dueDate);
      const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
      return {
        ...b,
        daysUntilDue,
        isOverdue: !b.isPaid && daysUntilDue < 0,
        isDueSoon: !b.isPaid && daysUntilDue >= 0 && daysUntilDue <= 7,
      };
    });

    const totalUnpaid = enriched.filter(b => !b.isPaid).reduce((s, b) => s + b.amount, 0);
    const overdueBills = enriched.filter(b => b.isOverdue);
    const dueSoonBills = enriched.filter(b => b.isDueSoon);

    res.json({
      bills: enriched,
      summary: {
        totalUnpaid: Math.round(totalUnpaid * 100) / 100,
        overdueBills: overdueBills.length,
        dueSoonBills: dueSoonBills.length,
      },
    });
  } catch (err) {
    console.error('Get bills error:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
};

// ─── MARK BILL PAID ───────────────────────────────────────────────────────────
const markBillPaid = async (req, res) => {
  try {
    const { billId } = req.params;
    const { familyId } = req.user;
    const paidAt = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.BILLS,
        Key: { familyId, billId },
        UpdateExpression: 'SET isPaid = :true, paidAt = :paidAt, updatedAt = :now',
        ExpressionAttributeValues: {
          ':true': true,
          ':paidAt': paidAt,
          ':now': paidAt,
        },
      })
    );

    res.json({ message: 'Bill marked as paid', billId, paidAt });
  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ error: 'Failed to update bill' });
  }
};

// ─── DELETE BILL ──────────────────────────────────────────────────────────────
const deleteBill = async (req, res) => {
  try {
    const { billId } = req.params;
    const { familyId } = req.user;
    await docClient.send(new DeleteCommand({ TableName: TABLES.BILLS, Key: { familyId, billId } }));
    res.json({ message: 'Bill deleted' });
  } catch (err) {
    console.error('Delete bill error:', err);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
};

module.exports = { addBill, getBills, markBillPaid, deleteBill };
