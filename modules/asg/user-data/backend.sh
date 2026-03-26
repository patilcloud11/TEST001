#!/bin/bash
###############################################################################
# Backend User Data – Amazon Linux 2023
###############################################################################
exec > /var/log/user-data.log 2>&1
set -euo pipefail

echo "=== Backend user-data started at $(date) ==="

ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
LOG_GROUP="${log_group_name}"
GITHUB_REPO="${github_repo}"
DOMAIN_NAME="${domain_name}"
REPO_DIR="/opt/family-finance-repo"
APP_DIR="/opt/family-finance-backend"
APP_USER="appuser"

###############################################################################
# IMDSv2 — hop_limit must be 2 for user-data scripts
###############################################################################
IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" || echo "")
if [[ -n "$IMDS_TOKEN" ]]; then
  INSTANCE_ID=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
    http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
else
  INSTANCE_ID=$(curl -sf http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
fi
echo "Instance ID: $INSTANCE_ID"

ASG_NAME=$(aws autoscaling describe-auto-scaling-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$AWS_REGION" \
  --query 'AutoScalingInstances[0].AutoScalingGroupName' \
  --output text 2>/dev/null || echo "")
LIFECYCLE_HOOK="${environment}-backend-scale-out-hook"
echo "ASG Name: $ASG_NAME"

###############################################################################
# System packages
# NOTE: curl-minimal conflicts with curl on Amazon Linux 2023
# --allowerasing replaces curl-minimal with full curl safely
###############################################################################
echo "=== Installing system packages ==="
dnf update -y
dnf install -y git unzip amazon-cloudwatch-agent --allowerasing
dnf install -y curl --allowerasing

###############################################################################
# Node.js 20 LTS + PM2
###############################################################################
echo "=== Installing Node.js 20 ==="
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
npm install -g pm2
echo "Node: $(node --version), NPM: $(npm --version)"

###############################################################################
# App user
###############################################################################
id -u "$APP_USER" &>/dev/null || useradd -r -m -s /bin/bash "$APP_USER"

###############################################################################
# SSH Deploy Key — fetch from SSM and configure for git clone
###############################################################################
echo "=== Setting up SSH deploy key ==="
mkdir -p /root/.ssh
chmod 700 /root/.ssh

aws ssm get-parameter \
  --name "/prod/github/deploy_key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" > /root/.ssh/id_ed25519

chmod 600 /root/.ssh/id_ed25519
ssh-keyscan -H github.com >> /root/.ssh/known_hosts 2>/dev/null
echo "=== SSH key configured ==="

###############################################################################
# Clone private repo using SSH deploy key
###############################################################################
echo "=== Cloning $GITHUB_REPO ==="
rm -rf "$REPO_DIR"
git clone "$GITHUB_REPO" "$REPO_DIR"
echo "Repo contents: $(ls $REPO_DIR)"

rm -rf "$APP_DIR"
cp -r "$REPO_DIR/backend" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
echo "App dir contents: $(ls $APP_DIR)"

###############################################################################
# Fetch JWT secret from SSM
# JWT_SECRET must be stored before deploying:
#   aws ssm put-parameter \
#     --name "/prod/app/jwt-secret" \
#     --value "$(openssl rand -hex 32)" \
#     --type "SecureString" --region us-east-1
#
# Groq and Alpha Vantage are free-tier keys — hardcoded directly
###############################################################################
echo "=== Fetching JWT secret from SSM ==="
JWT_SECRET=$(aws ssm get-parameter \
  --name "/prod/app/jwt-secret" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "CHANGE_THIS_IN_SSM_MIN_32_CHARS_LONG")

GROQ_API_KEY="REPLACE_WITH_ACTUAL_GROQ_KEY"
ALPHA_VANTAGE_KEY="REPLACE_WITH_ACTUAL_ALPHA_VANTAGE_KEY"

###############################################################################
# Write .env
# server.js calls require('dotenv').config() from CWD — PM2 cwd is APP_DIR
# DynamoDB: EC2 IAM role provides credentials automatically (no keys needed)
# The AWS SDK checks IAM role via IMDS when no explicit credentials are set
###############################################################################
cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=5000
AWS_REGION=$AWS_REGION

# DynamoDB table names — must match setupDynamoDB.js TableName values
# The IAM role attached to this EC2 provides DynamoDB access automatically
# No AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY needed on EC2
DYNAMODB_USERS_TABLE=finance_users
DYNAMODB_FAMILIES_TABLE=finance_families
DYNAMODB_EXPENSES_TABLE=finance_expenses
DYNAMODB_BILLS_TABLE=finance_bills
DYNAMODB_INVESTMENTS_TABLE=finance_investments

# JWT — used by jsonwebtoken package (already in package.json dependencies)
# Generated from SSM — store with: aws ssm put-parameter --name /prod/app/jwt-secret --value "$(openssl rand -hex 32)" --type SecureString
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

# Groq AI
GROQ_API_KEY=$GROQ_API_KEY
# GROQ_MODEL=fastllama-3.1-8b-instantReasoningdeepseek-r1-distill-llama-70b

# Alpha Vantage
ALPHA_VANTAGE_API_KEY=$ALPHA_VANTAGE_KEY

# CORS — allow frontend via ALB
FRONTEND_URL=https://$DOMAIN_NAME

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
echo "=== .env written ==="

###############################################################################
# Install dependencies
# NOTE: backend has no package-lock.json in repo → use npm install NOT npm ci
# npm ci requires package-lock.json; npm install works without it
###############################################################################
echo "=== Running npm install ==="
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --omit=dev
echo "=== npm install complete ==="

###############################################################################
# DynamoDB table setup
# Creates all 5 tables with GSIs if they don't exist (idempotent)
# Uses EC2 IAM role credentials automatically (no explicit keys)
# IAM role must have: dynamodb:CreateTable, DescribeTable, ListTables
# Tables created: finance_users, finance_families, finance_expenses,
#                 finance_bills, finance_investments
###############################################################################
echo "=== Running DynamoDB table setup ==="
node "$APP_DIR/scripts/setupDynamoDB.js"
echo "=== DynamoDB setup complete ==="

###############################################################################
# PM2 — start app and configure systemd service for auto-restart on reboot
###############################################################################
mkdir -p /var/log/app
chown -R "$APP_USER":"$APP_USER" /var/log/app

cat > "$APP_DIR/ecosystem.config.js" <<'PMEOF'
module.exports = {
  apps: [{
    name: 'family-finance-backend',
    script: 'server.js',
    cwd: '/opt/family-finance-backend',
    instances: 'max',
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production', PORT: 5000 },
    out_file: '/var/log/app/backend-out.log',
    error_file: '/var/log/app/backend-error.log',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 30000
  }]
};
PMEOF

echo "=== Starting PM2 ==="
sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.js"
sudo -u "$APP_USER" pm2 save
HOME=/root pm2 startup systemd -u "$APP_USER" --hp /home/"$APP_USER"
# Generate systemd unit as root (required), then enable it
pm2 startup systemd -u "$APP_USER" --hp /home/"$APP_USER"
systemctl enable "pm2-$APP_USER"
echo "=== PM2 started and enabled ==="

###############################################################################
# Health check — server.js registers GET /health (not /api/health)
# ALB target group also hits /health — both must return 200
###############################################################################
echo "=== Waiting for backend health ==="
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%%{http_code}" http://localhost:5000/health || echo "000")
  echo "Attempt $i/30: HTTP $STATUS"
  if [ "$STATUS" = "200" ]; then
    echo "=== Backend healthy ==="
    break
  fi
  sleep 5
done

###############################################################################
# CloudWatch Agent
###############################################################################
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<CWEOF
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "cwagent" },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/app/backend-out.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/backend-app", "timezone": "UTC" },
          { "file_path": "/var/log/app/backend-error.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/backend-error", "timezone": "UTC" },
          { "file_path": "/var/log/user-data.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/user-data", "timezone": "UTC" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "FamilyFinance/Backend",
    "metrics_collected": {
      "cpu": { "measurement": ["cpu_usage_idle","cpu_usage_user","cpu_usage_system"], "metrics_collection_interval": 60, "resources": ["*"] },
      "mem": { "measurement": ["mem_used_percent"], "metrics_collection_interval": 60 },
      "disk": { "measurement": ["used_percent"], "metrics_collection_interval": 60, "resources": ["/"] }
    },
    "append_dimensions": {
      "InstanceId": "\$${aws:InstanceId}",
      "AutoScalingGroupName": "\$${aws:AutoScalingGroupName}"
    }
  }
}
CWEOF
systemctl enable amazon-cloudwatch-agent
systemctl start amazon-cloudwatch-agent

###############################################################################
# Complete ASG lifecycle hook
###############################################################################
if [[ -n "$ASG_NAME" && "$ASG_NAME" != "None" ]]; then
  aws autoscaling complete-lifecycle-action \
    --lifecycle-hook-name "$LIFECYCLE_HOOK" \
    --auto-scaling-group-name "$ASG_NAME" \
    --lifecycle-action-result CONTINUE \
    --instance-id "$INSTANCE_ID" \
    --region "$AWS_REGION" || true
fi

echo "=== Backend bootstrap complete at $(date) ==="