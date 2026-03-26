/**
 * DynamoDB Table Setup Script
 * Run: node scripts/setupDynamoDB.js
 *
 * Creates all required tables with proper indexes for the
 * Family Finance Management System.
 */

// Load .env from the backend root regardless of where this script is called from
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const {
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} = require('@aws-sdk/client-dynamodb');
const { client, TABLES } = require('../config/dynamodb');

const tableDefinitions = [
  // ── Users Table ──────────────────────────────────────────────────────────
  {
    TableName: TABLES.USERS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'userId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },

  // ── Families Table ───────────────────────────────────────────────────────
  {
    TableName: TABLES.FAMILIES,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'familyId', AttributeType: 'S' },
      { AttributeName: 'adminUserId', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'familyId', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'admin-index',
        KeySchema: [{ AttributeName: 'adminUserId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },

  // ── Expenses Table ───────────────────────────────────────────────────────
  // Partition: familyId, Sort: timestamp (enables range queries by date)
  {
    TableName: TABLES.EXPENSES,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'familyId', AttributeType: 'S' },
      { AttributeName: 'expenseId', AttributeType: 'S' },
      { AttributeName: 'yearMonth', AttributeType: 'S' }, // e.g. "2024-06"
      { AttributeName: 'category', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'familyId', KeyType: 'HASH' },
      { AttributeName: 'expenseId', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      // Query expenses by month: familyId + yearMonth
      {
        IndexName: 'family-month-index',
        KeySchema: [
          { AttributeName: 'familyId', KeyType: 'HASH' },
          { AttributeName: 'yearMonth', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      // Query expenses by category: familyId + category
      {
        IndexName: 'family-category-index',
        KeySchema: [
          { AttributeName: 'familyId', KeyType: 'HASH' },
          { AttributeName: 'category', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },

  // ── Bills Table ──────────────────────────────────────────────────────────
  {
    TableName: TABLES.BILLS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'familyId', AttributeType: 'S' },
      { AttributeName: 'billId', AttributeType: 'S' },
      { AttributeName: 'dueDate', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'familyId', KeyType: 'HASH' },
      { AttributeName: 'billId', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'family-duedate-index',
        KeySchema: [
          { AttributeName: 'familyId', KeyType: 'HASH' },
          { AttributeName: 'dueDate', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },

  // ── Investments Table ────────────────────────────────────────────────────
  {
    TableName: TABLES.INVESTMENTS,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'familyId', AttributeType: 'S' },
      { AttributeName: 'investmentId', AttributeType: 'S' },
      { AttributeName: 'type', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'familyId', KeyType: 'HASH' },
      { AttributeName: 'investmentId', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'family-type-index',
        KeySchema: [
          { AttributeName: 'familyId', KeyType: 'HASH' },
          { AttributeName: 'type', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
];

async function tableExists(tableName) {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') return false;
    throw err;
  }
}

async function createTable(definition) {
  const exists = await tableExists(definition.TableName);
  if (exists) {
    console.log(`  ✓ Table already exists: ${definition.TableName}`);
    return;
  }
  await client.send(new CreateTableCommand(definition));
  console.log(`  ⏳ Creating table: ${definition.TableName}...`);
  await waitUntilTableExists(
    { client, maxWaitTime: 120 },
    { TableName: definition.TableName }
  );
  console.log(`  ✅ Table created: ${definition.TableName}`);
}

async function setup() {
  console.log('\n🚀 Setting up DynamoDB tables...\n');
  for (const table of tableDefinitions) {
    await createTable(table);
  }
  console.log('\n✨ All tables are ready!\n');
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
