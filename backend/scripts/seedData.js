/**
 * Seed Script — populates DynamoDB with realistic sample data
 * Run: node scripts/seedData.js
 */

// Load .env from the backend root regardless of where this script is called from
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');

const FAMILY_ID = 'seed-family-001';
const USER_ID = 'seed-user-001';

const categories = ['grocery', 'food_dining', 'transportation', 'utilities', 'entertainment', 'healthcare', 'education', 'clothing', 'other'];

function randomAmount(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function dateInMonth(year, month, day) {
  return new Date(year, month - 1, day).toISOString();
}

async function seed() {
  console.log('\n🌱 Seeding database...\n');

  // ── User ──────────────────────────────────────────────────────────────────
  const hashedPw = await bcrypt.hash('password123', 12);
  await docClient.send(new PutCommand({
    TableName: TABLES.USERS,
    Item: {
      userId: USER_ID, email: 'demo@familyfinance.in', name: 'Rahul Sharma',
      password: hashedPw, familyId: FAMILY_ID, role: 'admin',
      isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  }));
  console.log('  ✅ User created: demo@familyfinance.in / password123');

  // ── Family ────────────────────────────────────────────────────────────────
  await docClient.send(new PutCommand({
    TableName: TABLES.FAMILIES,
    Item: {
      familyId: FAMILY_ID, name: 'Sharma Family', adminUserId: USER_ID,
      members: [USER_ID], monthlyBudget: 60000, currency: 'INR',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  }));
  console.log('  ✅ Family created: Sharma Family (Budget ₹60,000/month)');

  // ── Expenses (last 3 months) ───────────────────────────────────────────────
  const expenseTemplates = [
    { cat: 'grocery', desc: 'Big Basket order', min: 1500, max: 4000 },
    { cat: 'grocery', desc: 'Reliance Fresh', min: 800, max: 2000 },
    { cat: 'food_dining', desc: 'Zomato order', min: 300, max: 800 },
    { cat: 'food_dining', desc: 'Restaurant dinner', min: 1200, max: 3000 },
    { cat: 'transportation', desc: 'Ola/Uber rides', min: 200, max: 600 },
    { cat: 'transportation', desc: 'Petrol', min: 2000, max: 4000 },
    { cat: 'entertainment', desc: 'Netflix subscription', min: 649, max: 649 },
    { cat: 'entertainment', desc: 'Movie tickets', min: 800, max: 1500 },
    { cat: 'healthcare', desc: 'Medical checkup', min: 500, max: 2000 },
    { cat: 'education', desc: 'Online course', min: 1500, max: 5000 },
    { cat: 'clothing', desc: 'Myntra order', min: 1000, max: 3000 },
    { cat: 'other', desc: 'Miscellaneous', min: 200, max: 1000 },
  ];

  let expCount = 0;
  const now = new Date();
  for (let m = 0; m < 3; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    // 15–20 expenses per month
    const count = Math.floor(Math.random() * 6) + 15;
    for (let i = 0; i < count; i++) {
      const tmpl = expenseTemplates[Math.floor(Math.random() * expenseTemplates.length)];
      const day = Math.floor(Math.random() * 28) + 1;
      const expenseId = `${Date.now()}-${uuidv4().slice(0, 8)}-${i}`;
      await docClient.send(new PutCommand({
        TableName: TABLES.EXPENSES,
        Item: {
          familyId: FAMILY_ID, expenseId,
          amount: randomAmount(tmpl.min, tmpl.max),
          category: tmpl.cat, description: tmpl.desc,
          date: dateInMonth(year, month, day), yearMonth,
          paidBy: USER_ID, paidByName: 'Rahul Sharma',
          tags: [], createdBy: USER_ID,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      }));
      expCount++;
    }
  }
  console.log(`  ✅ ${expCount} expenses seeded across 3 months`);

  // ── Bills ─────────────────────────────────────────────────────────────────
  const bills = [
    { name: 'Electricity Bill', type: 'electricity', amount: 2800, dueDate: '2025-08-15', isRecurring: true },
    { name: 'Water Bill', type: 'water', amount: 450, dueDate: '2025-08-10', isRecurring: true },
    { name: 'LPG Cylinder', type: 'lpg', amount: 950, dueDate: '2025-08-20', isRecurring: false },
    { name: 'House Rent', type: 'rent', amount: 18000, dueDate: '2025-08-01', isRecurring: true, isPaid: true },
    { name: 'Broadband Internet', type: 'internet', amount: 1299, dueDate: '2025-08-05', isRecurring: true },
    { name: 'Mobile Recharge', type: 'mobile', amount: 599, dueDate: '2025-08-25', isRecurring: true },
  ];

  for (const b of bills) {
    await docClient.send(new PutCommand({
      TableName: TABLES.BILLS,
      Item: {
        familyId: FAMILY_ID,
        billId: `bill-${Date.now()}-${uuidv4().slice(0, 6)}`,
        ...b, isPaid: b.isPaid || false, notes: '',
        createdBy: USER_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    }));
    await new Promise(r => setTimeout(r, 50)); // avoid timestamp collisions
  }
  console.log(`  ✅ ${bills.length} bills seeded`);

  // ── Investments ───────────────────────────────────────────────────────────
  const investments = [
    { name: 'Mirae Asset Large Cap SIP', type: 'sip', principal: 150000, monthlyAmount: 5000, expectedReturnPct: 12, startDate: '2022-01-01', maturityDate: null },
    { name: 'LIC Jeevan Anand Policy', type: 'lic', principal: 200000, monthlyAmount: 8000, expectedReturnPct: 6.5, startDate: '2021-04-01', maturityDate: '2041-04-01', policyNumber: 'LIC-783421' },
    { name: 'PPF Account', type: 'ppf', principal: 100000, monthlyAmount: null, expectedReturnPct: 7.1, startDate: '2020-04-01', maturityDate: '2035-04-01' },
    { name: 'HDFC Fixed Deposit', type: 'fd', principal: 250000, monthlyAmount: null, expectedReturnPct: 7.4, startDate: '2024-01-15', maturityDate: '2025-01-15' },
    { name: 'Digital Gold', type: 'gold', principal: 50000, monthlyAmount: null, expectedReturnPct: 10, startDate: '2023-06-01', maturityDate: null },
    { name: 'NPS Tier 1', type: 'nps', principal: 80000, monthlyAmount: 3000, expectedReturnPct: 10, startDate: '2022-07-01', maturityDate: '2055-01-01' },
  ];

  for (const inv of investments) {
    await docClient.send(new PutCommand({
      TableName: TABLES.INVESTMENTS,
      Item: {
        familyId: FAMILY_ID,
        investmentId: `inv-${Date.now()}-${uuidv4().slice(0, 6)}`,
        ...inv, isActive: true, notes: '',
        createdBy: USER_ID, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
    }));
    await new Promise(r => setTimeout(r, 50));
  }
  console.log(`  ✅ ${investments.length} investments seeded`);

  console.log('\n🎉 Seed complete!\n');
  console.log('  Login credentials:');
  console.log('  📧 Email   : demo@familyfinance.in');
  console.log('  🔑 Password: password123\n');
}

seed().catch(err => { console.error('❌ Seed failed:', err); process.exit(1); });
