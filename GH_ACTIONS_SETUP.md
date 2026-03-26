# GitHub Actions Setup Guide

Follow these steps to configure your GitHub repository for the Family Finance AI CI/CD pipeline.

## 1. GitHub Secrets (Sensitive)
Navigate to **Settings > Secrets and variables > Actions > New repository secret**.

| Name | Description | Example Value |
|------|-------------|---------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM User Access Key | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM User Secret Key | `abcd123...` |
| `JWT_SECRET` | Secret for Backend Auth | `minimum-32-chars-long-secret` |
| `GROQ_API_KEY` | Groq AI API Key | `gsk_...` |
| `ALPHA_VANTAGE_KEY` | Alpha Vantage API Key | `your_key` |
| `SLACK_WEBHOOK_URL` | Slack Alerts Webhook | `https://hooks.slack.com/...` |

## 2. GitHub Variables (Non-Sensitive)
Navigate to **Settings > Secrets and variables > Actions > Variables > New repository variable**.

| Name | Description | Value |
|------|-------------|-------|
| `AWS_REGION` | AWS Region | `us-east-1` |
| `ENVIRONMENT` | Target Environment | `prod` |
| `DOMAIN_NAME` | confirmed domain | `patilvishesh.online` |
| `VITE_API_URL` | Backend API URL | `https://api.patilvishesh.online/api` |

## 3. Backend .env Example
Create a `.env` file in `tf-fixed/backend/` for local development.

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
AWS_REGION=us-east-1
# Only for local dev, EC2 uses IAM roles
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Secrets
JWT_SECRET=your_secret
GROQ_API_KEY=your_groq_key
ALPHA_VANTAGE_KEY=your_alpha_key

# Database
DYNAMODB_USERS_TABLE=finance_users
DYNAMODB_FAMILIES_TABLE=finance_families
DYNAMODB_EXPENSES_TABLE=finance_expenses
DYNAMODB_BILLS_TABLE=finance_bills
DYNAMODB_INVESTMENTS_TABLE=finance_investments
```

## 4. Deployment Prerequisites
- **IAM Permissions**: The IAM User specified in `AWS_ACCESS_KEY_ID` must have permissions for:
  - S3 (Terraform State)
  - DynamoDB (Terraform Lock)
  - EC2 (Management)
  - SSM (Run Command)
  - VPC/ALB/ASG (Full Access for Terraform)
- **EC2 Roles**: Ensure your EC2 instances have the `AmazonSSMManagedInstanceCore` policy attached to their IAM roles so GitHub can talk to them via SSM.
