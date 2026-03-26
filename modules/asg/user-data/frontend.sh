#!/bin/bash
###############################################################################
# Frontend User Data – Amazon Linux 2023
###############################################################################
exec > /var/log/user-data.log 2>&1
set -euo pipefail

echo "=== Frontend user-data started at $(date) ==="

ENVIRONMENT="${environment}"
AWS_REGION="${aws_region}"
LOG_GROUP="${log_group_name}"
GITHUB_REPO="${github_repo}"
INTERNAL_LB_DNS="${internal_lb_dns}"
REPO_DIR="/opt/family-finance-repo"
APP_DIR="/opt/family-finance-frontend"
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
LIFECYCLE_HOOK="${environment}-frontend-scale-out-hook"
echo "ASG Name: $ASG_NAME"

###############################################################################
# System packages
###############################################################################
echo "=== Installing system packages ==="
dnf update -y
dnf install -y git unzip amazon-cloudwatch-agent nginx --allowerasing
dnf install -y curl --allowerasing

###############################################################################
# Node.js 20 LTS (build only — nginx serves the static output)
###############################################################################
echo "=== Installing Node.js 20 ==="
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
echo "Node: $(node --version)"

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

# Fetch private key from SSM
aws ssm get-parameter \
  --name "/prod/github/deploy_key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region "$AWS_REGION" > /root/.ssh/id_ed25519

chmod 600 /root/.ssh/id_ed25519

# Trust github.com host — avoids interactive prompt during clone
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
cp -r "$REPO_DIR/frontend" "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
echo "App dir contents: $(ls $APP_DIR)"

###############################################################################
# .env.production — VITE_* vars baked in at build time
###############################################################################
cat > "$APP_DIR/.env.production" <<EOF
VITE_API_URL=/api
NODE_ENV=production
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env.production"

###############################################################################
# Install dependencies and build
###############################################################################
echo "=== Running npm ci ==="
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci
echo "=== Building React app ==="
sudo -u "$APP_USER" npm run build
echo "=== Build complete. dist/: $(ls $APP_DIR/dist) ==="

###############################################################################
# nginx config — port 3000 matches ALB target group
###############################################################################
rm -f /etc/nginx/conf.d/default.conf

cat > /etc/nginx/conf.d/family-finance.conf <<NGINXEOF
server {
    listen 3000;
    server_name _;
    root $APP_DIR/dist;
    index index.html;

    # ALB health check — answered by nginx directly, no backend needed
    location /health {
        access_log off;
        return 200 '{"status":"ok","service":"frontend","environment":"$ENVIRONMENT"}';
        add_header Content-Type application/json;
    }

    # Proxy /api/* to internal ALB → backend instances
    location /api/ {
        proxy_pass         http://$INTERNAL_LB_DNS/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # React SPA — fallback to index.html for client-side routes
    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # Static assets — long cache
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
}
NGINXEOF

echo "=== Testing nginx config ==="
nginx -t
systemctl enable nginx
systemctl start nginx
echo "=== nginx started ==="

###############################################################################
# Health check self-test
###############################################################################
sleep 3
STATUS=$(curl -s -o /dev/null -w "%%{http_code}" http://localhost:3000/health || echo "000")
echo "Health check: HTTP $STATUS"
if [ "$STATUS" != "200" ]; then
  echo "WARNING: nginx not healthy"
  systemctl status nginx --no-pager || true
fi

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
          { "file_path": "/var/log/nginx/access.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/nginx-access", "timezone": "UTC" },
          { "file_path": "/var/log/nginx/error.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/nginx-error", "timezone": "UTC" },
          { "file_path": "/var/log/user-data.log", "log_group_name": "$LOG_GROUP", "log_stream_name": "{instance_id}/user-data", "timezone": "UTC" }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "FamilyFinance/Frontend",
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

echo "=== Frontend bootstrap complete at $(date) ==="
