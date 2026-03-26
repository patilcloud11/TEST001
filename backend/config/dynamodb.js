/**
 * DynamoDB Configuration
 *
 * LOCAL DEV:  Reads AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY from .env
 * AWS EC2:    Uses EC2 IAM Instance Role automatically — NO keys needed in .env
 *
 * The AWS SDK automatically checks credentials in this order:
 *   1. Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
 *   2. EC2 Instance Metadata Service (IAM role attached to EC2)
 *   3. ~/.aws/credentials file
 *
 * On EC2 with an IAM role, step 2 kicks in automatically.
 * You do NOT need to set AWS_ACCESS_KEY_ID on EC2 — remove it from .env.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// Build client config — only pass credentials if explicitly set in env.
// On EC2 with IAM role, omit credentials entirely so SDK uses the role.
const clientConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
};

// Only inject explicit credentials in local dev (when keys exist in .env).
// On AWS EC2, AWS_ACCESS_KEY_ID won't be set → SDK uses IAM role.
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const client = new DynamoDBClient(clientConfig);

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Table name constants — driven by environment variables.
// In production all point to the same DynamoDB table (single-table design).
// In local dev they point to separate tables if you prefer.
const TABLES = {
  USERS:       process.env.DYNAMODB_USERS_TABLE       || 'finance_users',
  FAMILIES:    process.env.DYNAMODB_FAMILIES_TABLE    || 'finance_families',
  EXPENSES:    process.env.DYNAMODB_EXPENSES_TABLE    || 'finance_expenses',
  BILLS:       process.env.DYNAMODB_BILLS_TABLE       || 'finance_bills',
  INVESTMENTS: process.env.DYNAMODB_INVESTMENTS_TABLE || 'finance_investments',
};

module.exports = { docClient, client, TABLES };
