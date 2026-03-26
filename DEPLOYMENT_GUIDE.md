# Family Finance AI – Complete AWS Deployment Guide
## End-to-End Infrastructure Setup | us-east-1 | Multi-AZ | 3-Tier

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Step 1 – AWS Account Preparation](#step-1--aws-account-preparation)
4. [Step 2 – Domain & DNS (GoDaddy → Route 53)](#step-2--domain--dns-godaddy--route-53)
5. [Step 3 – GitHub Repo Preparation](#step-3--github-repo-preparation)
6. [Step 4 – Terraform Deployment](#step-4--terraform-deployment)
7. [Step 5 – Verify Security Groups](#step-5--verify-security-groups)
8. [Step 6 – Verify WAF](#step-6--verify-waf)
9. [Step 7 – Verify ALB & ACM](#step-7--verify-alb--acm)
10. [Step 8 – Verify ASG & EC2](#step-8--verify-asg--ec2)
11. [Step 9 – Verify DynamoDB](#step-9--verify-dynamodb)
12. [Step 10 – Verify CloudWatch & Alarms](#step-10--verify-cloudwatch--alarms)
13. [Step 11 – Verify SNS → Lambda → Slack](#step-11--verify-sns--lambda--slack)
14. [Step 12 – Smoke Test End-to-End](#step-12--smoke-test-end-to-end)
15. [Step 13 – Grafana Setup](#step-13--grafana-setup)
16. [Security Hardening Checklist](#security-hardening-checklist)
17. [Cost Estimation](#cost-estimation)
18. [Troubleshooting](#troubleshooting)
19. [Rollback Procedures](#rollback-procedures)

---

## 1. Architecture Overview

```
Internet
    │
    ▼
GoDaddy (NS records → Route 53)
    │
    ▼
Route 53  (A alias → External ALB)
    │
    ▼
WAF v2 WebACL  (Managed Rules + Rate Limit + Bot Control)
    │
    ▼
External ALB  ← ACM TLS 1.3 Certificate
  us-east-1a | us-east-1b | us-east-1c  [public subnets]
    │  port 443 → TG → port 3000
    ▼
Frontend ASG  [private-frontend subnets]
  Next.js / React  •  PM2 cluster  •  Node.js 20
    │  HTTP :80 → Internal ALB
    ▼
Internal ALB  [private-frontend subnets, internal=true]
    │  port 80 → TG → port 8080
    ▼
Backend ASG  [private-backend subnets]
  Express API  •  PM2 cluster  •  Node.js 20
    │  AWS SDK  •  IAM Role  •  VPC Endpoint
    ▼
DynamoDB  (PAY_PER_REQUEST • 2 GSIs • PITR • Encrypted)
    │  Streams
    ▼
Lambda (stream_logger) ──► CW Logs /aws/dynamodb/prod/streams

EC2 CloudWatch Agent ──────► CW Logs /aws/ec2/prod/backend
                                    │  Metric Filters
                                    ▼
                             CloudWatch Alarms
                                    │ ALARM state
                                    ▼
                              SNS Topic
                                    │
                                    ▼
                        Lambda (slack_notifier)
                                    │
                                    ▼
                          Slack  #prod-alerts
```

**Subnet Layout (10.0.0.0/16):**

| Subnet | AZ-a | AZ-b | AZ-c |
|--------|------|------|------|
| Public (ALB + NAT) | 10.0.0.0/24 | 10.0.1.0/24 | 10.0.2.0/24 |
| Private Frontend | 10.0.10.0/24 | 10.0.11.0/24 | 10.0.12.0/24 |
| Private Backend | 10.0.20.0/24 | 10.0.21.0/24 | 10.0.22.0/24 |
| Private Data | 10.0.30.0/24 | 10.0.31.0/24 | 10.0.32.0/24 |

**Security Group Chain:**
```
Internet (0.0.0.0/0) → ALB SG → Frontend SG → Internal LB SG → Backend SG → DynamoDB (VPC Endpoint)
```

---

## 2. Prerequisites

### Tools Required

**Terraform >= 1.6.0**
```bash
# macOS
brew tap hashicorp/tap && brew install hashicorp/tap/terraform

# Linux (Ubuntu/Debian)
wget -O- https://apt.releases.hashicorp.com/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
  https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
  sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

terraform version   # must show >= 1.6.0
```

**AWS CLI v2**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

aws --version
```

**Configure AWS CLI**
```bash
aws configure
# AWS Access Key ID:     <your-access-key>
# AWS Secret Access Key: <your-secret-key>
# Default region:        us-east-1
# Default output format: json

# Verify
aws sts get-caller-identity
```

### Required AWS IAM Permissions
Attach these to your IAM user before running Terraform:
- `AmazonVPCFullAccess`
- `AmazonEC2FullAccess`
- `ElasticLoadBalancingFullAccess`
- `AutoScalingFullAccess`
- `AmazonDynamoDBFullAccess`
- `AWSWAFv2FullAccess`
- `CloudWatchFullAccess`
- `AmazonSNSFullAccess`
- `AWSLambda_FullAccess`
- `AmazonRoute53FullAccess`
- `AWSCertificateManagerFullAccess`
- `IAMFullAccess`
- `AmazonS3FullAccess`
- `AmazonSSMFullAccess`

> For a clean start, `AdministratorAccess` is acceptable in a dedicated deployment account.

---

## Step 1 – AWS Account Preparation

### 1.1 Create EC2 Key Pair
```bash
aws ec2 delete-key-pair --key-name family-finance-keypair --region us-east-1

rm -f ~/.ssh/family-finance-keypair.pem

aws ec2 create-key-pair \
  --key-name family-finance-keypair \
  --region us-east-1 \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/family-finance-keypair.pem

chmod 400 ~/.ssh/family-finance-keypair.pem
```

### 1.2 Create Terraform State Backend

**S3 bucket for state:**
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
BUCKET_NAME="tf-state-family-finance-${ACCOUNT_ID}"

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "State bucket: $BUCKET_NAME"
```

<!-- **DynamoDB lock table:**
```bash
aws dynamodb create-table \
  --table-name terraform-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

echo "Lock table created: terraform-lock"
``` -->

### 1.3 Enable S3 Backend in main.tf
Open `main.tf` and uncomment the backend block, substituting your bucket name:
```hcl
backend "s3" {
  bucket         = "tf-state-family-finance-811572529216"   # your account ID
  key            = "family-finance/prod/terraform.tfstate"
  region         = "us-east-1"
  dynamodb_table = "terraform-lock"
  encrypt        = true
}
```

### 1.4 Store Sensitive Values in SSM Parameter Store
```bash
# Store Slack webhook URL securely (read by Terraform at apply time)
aws ssm put-parameter \
  --name "/prod/slack/webhook-url" \
  --type "SecureString" \
  --value "REPLACE_WITH_ACTUAL_WEBHOOK" \
  --region us-east-1

echo "Slack webhook stored in SSM"
```

---

## Step 2 – Domain & DNS (GoDaddy → Route 53)

### 2.1 Create Route 53 Hosted Zone
```bash
aws route53 create-hosted-zone \
  --name global-aws.site \
  --caller-reference $(date +%s) \
  --region us-east-1

# Save the output — you need the 4 NS records and the Hosted Zone ID
# Example NS records:
#   ns-123.awsdns-45.com.
#   ns-456.awsdns-67.net.
#   ns-789.awsdns-01.co.uk.
#   ns-012.awsdns-34.org.
```

Get NS records programmatically:
```bash
ZONE_ID=$(aws route53 list-hosted-zones \
  --query 'HostedZones[?Name==`familyfinance.io.`].Id' \
  --output text | sed 's|/hostedzone/||')

aws route53 get-hosted-zone \
  --id "$ZONE_ID" \
  --query 'DelegationSet.NameServers' \
  --output table
```

### 2.2 Point GoDaddy to Route 53

1. Log in to **GoDaddy.com → My Products → Domains**
2. Click **DNS** next to your domain
3. Scroll to **Nameservers** → Click **Change**
4. Select **"Enter my own nameservers (advanced)"**
5. Replace the existing nameservers with your 4 AWS NS records (without trailing dots)
6. Click **Save**

> ⚠️ **DNS propagation takes 15 minutes to 48 hours.** Terraform's ACM certificate validation will time out if DNS is not delegated. Verify before running `terraform apply`.

### 2.3 Verify DNS Delegation
```bash
# Wait 15-30 minutes after GoDaddy change, then run:
dig NS global-aws.site +short

# Must return awsdns records like:
# ns-123.awsdns-45.com.
# ns-456.awsdns-67.net.

# If still showing GoDaddy nameservers, wait and try again
```

---

## Step 3 – GitHub Repo Preparation

### 3.1 Add Health Check Endpoints to Your Apps

**Frontend — Next.js** (`pages/api/health.js`):
```javascript
export default function handler(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'frontend',
    timestamp: new Date().toISOString()
  });
}
```

**Backend — Express.js** (`src/routes/health.js`):
```javascript
const router = require('express').Router();
router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString()
  });
});
module.exports = router;
```

These paths are configured in the ALB target group health checks — the instances will show **unhealthy** if these don't return HTTP 200.

### 3.2 Verify package.json Scripts

**Frontend:**
```json
{
  "scripts": {
    "build": "next build",
    "start": "next start -p 3000"
  }
}
```

**Backend** — make sure your entry point is `src/index.js`. If it's different (e.g., `app.js`, `server.js`), update `modules/asg/user-data/backend.sh` in the PM2 ecosystem section:
```bash
# Find this line in backend.sh and change to match your entry point:
script: 'src/index.js',
```

### 3.3 For Private Repos — Setup Deploy Key

<!-- Private repo — so we need authentication to clone it. The cleanest approach for EC2 is a GitHub Personal Access Token (PAT) stored in SSM, embedded in the clone URL. This works with HTTPS (no SSH key complexity needed).
Here's what needs to happen:
Step 1 — Create a GitHub PAT (do this once):

Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
Give it read-only access to your repo (Contents: Read)
Copy the token

Step 2 — Store it in SSM (do this once):
bashaws ssm put-parameter \
  --name "/prod/github/pat" \
  --value "github_pat_YOUR_TOKEN_HERE" \
  --type "SecureString" \
  --region us-east-1 -->

```bash
# Generate deploy key
ssh-keygen -t ed25519 -C "aws-ec2-deploy" -f ~/.ssh/deploy-key -N ""

# Add public key to GitHub:
# Go to: github.com/YOUR_ORG/REPO → Settings → Deploy Keys → Add deploy key
# Paste: cat ~/.ssh/deploy-key.pub
# Check: Allow write access = NO (read-only is fine)

# Store private key in SSM
aws ssm put-parameter \
  --name "/prod/github/deploy_key" \
  --value "$(cat ~/.ssh/deploy-key)" \
  --type "SecureString" \
  --region us-east-1

#   Store Manually in SSM
# Go to:
AWS Console → Systems Manager → Parameter Store → Create Parameter
Fill like this:
Field	Value
Name	/prod/github/deploy_key
Type	SecureString
KMS Key	Default (aws/ssm)
Value	Paste full private key
Tier	Standard

# # Update user-data scripts to fetch the key before git clone.
# # Add these lines to both frontend.sh and backend.sh BEFORE the git clone line:
cat >> modules/asg/user-data/frontend.sh << 'PATCH'
# # Fetch GitHub deploy key from SSM
mkdir -p /root/.ssh
aws ssm get-parameter \
  --name "/prod/github/deploy-key" \
  --with-decryption \
  --query Parameter.Value \
  --output text \
  --region $AWS_REGION > /root/.ssh/id_ed25519
chmod 600 /root/.ssh/id_ed25519
ssh-keyscan github.com >> /root/.ssh/known_hosts 2>/dev/null
PATCH

# Also change GITHUB_REPO in terraform.tfvars to SSH format:
# github_repo_frontend = "git@github.com:YOUR_ORG/family-finance-frontend.git"
```

---

## Step 4 – Terraform Deployment

### 4.1 Prepare Configuration
```bash
cd terraform-family-finance

# Copy and edit your variables
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
aws_region         = "us-east-1"
environment        = "prod"
vpc_cidr           = "10.0.0.0/16"
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

domain_name       = "familyfinance.io"          # Your actual domain
slack_webhook_url = "https://hooks.slack.com/services/T.../B.../..."

frontend_ami           = "ami-0c101f26f147fa7fd"  # AL2023 us-east-1 (verify latest)
backend_ami            = "ami-0c101f26f147fa7fd"
frontend_instance_type = "t3.small"
backend_instance_type  = "t3.medium"

github_repo_frontend = "https://github.com/YOUR_ORG/family-finance-frontend.git"
github_repo_backend  = "https://github.com/YOUR_ORG/family-finance-backend.git"

key_name = "family-finance-keypair"
```

**Security:** Keep `terraform.tfvars` out of git:
```bash
cat >> .gitignore << 'EOF'
terraform.tfvars
.terraform/
*.tfstate
*.tfstate.backup
*.tfplan
infrastructure-outputs.json
EOF
```

Alternatively, set sensitive values as env vars:
```bash
export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/..."
```

### 4.2 Verify Latest AMI ID
The hardcoded AMI may become outdated. Always verify the latest AL2023 AMI:
```bash
aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query Parameter.Value \
  --output text \
  --region us-east-1
# Use this value for both frontend_ami and backend_ami in terraform.tfvars
```

### 4.3 Initialize Terraform
```bash
terraform init

# Expected output:
# Initializing modules...
# - module.vpc
# - module.security_groups
# - module.alb
# - module.asg
# - module.dynamodb
# - module.waf
# - module.monitoring
# Terraform has been successfully initialized!
```

### 4.4 Validate
```bash
terraform validate
# Success! The configuration is valid.
```

### 4.5 Plan
```bash
terraform plan -out=tfplan 2>&1 | tee plan-output.log

# Review key sections:
grep -E "will be created|must be replaced|will be destroyed" plan-output.log | head -50
```

Expected resource count: ~85-100 resources added.

Key items to confirm in the plan:
- `aws_vpc.main` — 1 VPC
- `aws_subnet.*` — 12 subnets (4 tiers × 3 AZs)
- `aws_nat_gateway.nat[0/1/2]` — 3 NAT Gateways
- `aws_security_group.alb/frontend/internal_lb/backend` — 4 SGs
- `aws_lb.external` + `aws_lb.internal` — 2 ALBs
- `aws_acm_certificate.main` — 1 wildcard cert
- `aws_dynamodb_table.main` — 1 table
- `aws_autoscaling_group.frontend` + `aws_autoscaling_group.backend` — 2 ASGs
- `aws_wafv2_web_acl.main` — 1 WAF
- `aws_cloudwatch_metric_alarm.*` — multiple alarms
- `aws_lambda_function.slack_notifier` — 1 Lambda
- `aws_sns_topic.alerts` — 1 SNS topic

### 4.6 Apply in Phases (Recommended)

Apply one module at a time to isolate issues:

**Phase 1 – VPC & Security Groups**
```bash
terraform apply -target=module.vpc -target=module.security_groups
# Takes ~3 minutes
```

**Phase 2 – WAF**
```bash
terraform apply -target=module.waf
# Takes ~2 minutes
```

**Phase 3 – ACM + ALB** (requires DNS to be delegated first!)
```bash
terraform apply -target=module.alb
# Takes ~10-15 minutes (ACM DNS validation)
# Watch for: aws_acm_certificate_validation.main: Still creating...
# This is normal — ACM is waiting for Route 53 DNS validation record to propagate
```

**Phase 4 – DynamoDB + Monitoring**
```bash
terraform apply -target=module.dynamodb -target=module.monitoring
# Takes ~3 minutes
```

**Phase 5 – ASG (EC2 instances)**
```bash
terraform apply -target=module.asg
# Takes ~5-8 minutes
# EC2 instances launch and run user-data scripts
```

**Phase 6 – Final apply (catches any dependencies)**
```bash
terraform apply
# Should show: 0 to add, 0 to change, 0 to destroy
# If anything remains, it applies now
```

### 4.7 Save Outputs
```bash
terraform output -json | tee infrastructure-outputs.json

# Quick view of key outputs:
echo "External ALB DNS: $(terraform output -raw external_alb_dns)"
echo "Internal ALB DNS: $(terraform output -raw internal_alb_dns)"
echo "DynamoDB Table:   $(terraform output -raw dynamodb_table_name)"
echo "SNS Topic ARN:    $(terraform output -raw sns_topic_arn)"
```

---

## Step 5 – Verify Security Groups

### 5.1 List All Project Security Groups
```bash
aws ec2 describe-security-groups \
  --filters "Name=tag:Environment,Values=prod" \
  --region us-east-1 \
  --query 'SecurityGroups[*].{Name:GroupName,ID:GroupId}' \
  --output table
```

Expected output:
```
----------------------------------------------
|       DescribeSecurityGroups               |
+---------------------------+----------------+
|           Name            |      ID        |
+---------------------------+----------------+
|  prod-alb-sg              |  sg-0abc...    |
|  prod-frontend-sg         |  sg-0def...    |
|  prod-internal-lb-sg      |  sg-0ghi...    |
|  prod-backend-sg          |  sg-0jkl...    |
+---------------------------+----------------+
```

### 5.2 Verify ALB SG — Source Must Be 0.0.0.0/0
```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-alb-sg" \
  --region us-east-1 \
  --query 'SecurityGroups[0].IpPermissions[*].{Port:FromPort,CIDR:IpRanges[0].CidrIp}' \
  --output table

# Expected:
# Port 80  → 0.0.0.0/0
# Port 443 → 0.0.0.0/0
```

### 5.3 Verify Frontend SG — Source Must Be ALB SG
```bash
ALB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-alb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text --region us-east-1)

FE_SOURCE=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-frontend-sg" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`3000`].UserIdGroupPairs[0].GroupId' \
  --output text --region us-east-1)

echo "ALB SG:              $ALB_SG"
echo "Frontend source SG:  $FE_SOURCE"
[ "$ALB_SG" = "$FE_SOURCE" ] && echo "✅ CORRECT" || echo "❌ MISMATCH"
```

### 5.4 Verify Backend SG — Source Must Be Internal LB SG
```bash
ILB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-internal-lb-sg" \
  --query 'SecurityGroups[0].GroupId' --output text --region us-east-1)

BE_SOURCE=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=prod-backend-sg" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`8080`].UserIdGroupPairs[0].GroupId' \
  --output text --region us-east-1)

echo "Internal LB SG:     $ILB_SG"
echo "Backend source SG:  $BE_SOURCE"
[ "$ILB_SG" = "$BE_SOURCE" ] && echo "✅ CORRECT" || echo "❌ MISMATCH"
```

---

## Step 6 – Verify WAF

### 6.1 Check WebACL Exists and Is Active
```bash
aws wafv2 list-web-acls \
  --scope REGIONAL \
  --region us-east-1 \
  --query 'WebACLs[*].{Name:Name,ID:Id}' \
  --output table
```

### 6.2 Verify WAF is Attached to External ALB
```bash
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names prod-external-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text --region us-east-1)

aws wafv2 get-web-acl-for-resource \
  --resource-arn "$ALB_ARN" \
  --region us-east-1 \
  --query 'WebACL.{Name:Name,DefaultAction:DefaultAction}' \
  --output table

# Should return your WAF ACL name. If "ResourceNotFoundException" — WAF not attached.
```

### 6.3 Test WAF Is Blocking Attacks
```bash
ALB_DNS=$(terraform output -raw external_alb_dns)

# SQL injection — must return 403
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://familyfinance.io/?id=1'+OR+'1'%3D'1")
echo "SQL injection test:  HTTP $HTTP_CODE  (expected: 403)"

# XSS — must return 403
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "https://familyfinance.io/?search=%3Cscript%3Ealert(1)%3C/script%3E")
echo "XSS test:            HTTP $HTTP_CODE  (expected: 403)"

# Normal request — must pass (200 or 30x)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://familyfinance.io/")
echo "Normal request:      HTTP $HTTP_CODE  (expected: 200)"
```

---

## Step 7 – Verify ALB & ACM

### 7.1 Confirm ACM Certificate Is ISSUED
```bash
CERT_ARN=$(terraform output -raw acm_certificate_arn)

aws acm describe-certificate \
  --certificate-arn "$CERT_ARN" \
  --region us-east-1 \
  --query 'Certificate.{Domain:DomainName,Status:Status,AltNames:SubjectAlternativeNames}' \
  --output table

# Status must be ISSUED
# If PENDING_VALIDATION: DNS hasn't propagated yet; wait longer
```

### 7.2 Verify External ALB Is Active
```bash
aws elbv2 describe-load-balancers \
  --names prod-external-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].{DNS:DNSName,State:State.Code,Scheme:Scheme}' \
  --output table

# State: active
# Scheme: internet-facing
```

### 7.3 Verify Internal ALB Is Active
```bash
aws elbv2 describe-load-balancers \
  --names prod-internal-alb \
  --region us-east-1 \
  --query 'LoadBalancers[0].{DNS:DNSName,State:State.Code,Scheme:Scheme}' \
  --output table

# Scheme: internal
```

### 7.4 Check Target Group Health
```bash
# Frontend target group
FE_TG=$(aws elbv2 describe-target-groups \
  --names prod-frontend-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text --region us-east-1)

echo "=== Frontend Target Group Health ==="
aws elbv2 describe-target-health \
  --target-group-arn "$FE_TG" --region us-east-1 \
  --query 'TargetHealthDescriptions[*].{ID:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
  --output table

# Backend target group
BE_TG=$(aws elbv2 describe-target-groups \
  --names prod-backend-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text --region us-east-1)

echo "=== Backend Target Group Health ==="
aws elbv2 describe-target-health \
  --target-group-arn "$BE_TG" --region us-east-1 \
  --query 'TargetHealthDescriptions[*].{ID:Target.Id,State:TargetHealth.State,Reason:TargetHealth.Reason}' \
  --output table

# All states should be: healthy
# Common issue if unhealthy:
#   - App not listening on expected port (3000 or 8080)
#   - /health or /api/health endpoint not returning 200
#   - User data script failed (check /var/log/user-data.log via SSM)
```

---

## Step 8 – Verify ASG & EC2

### 8.1 Check ASG Status
```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names prod-frontend-asg prod-backend-asg \
  --region us-east-1 \
  --query 'AutoScalingGroups[*].{
    Name:AutoScalingGroupName,
    Min:MinSize,
    Max:MaxSize,
    Desired:DesiredCapacity,
    Running:length(Instances[?LifecycleState==`InService`])
  }' \
  --output table
```

### 8.2 View Lifecycle Hooks
```bash
for ASG in prod-frontend-asg prod-backend-asg; do
  echo "=== Lifecycle Hooks: $ASG ==="
  aws autoscaling describe-lifecycle-hooks \
    --auto-scaling-group-name "$ASG" \
    --region us-east-1 \
    --query 'LifecycleHooks[*].{Hook:LifecycleHookName,Transition:LifecycleTransition,Timeout:HeartbeatTimeout}' \
    --output table
done

# Expected per ASG:
# *-scale-in-hook   → autoscaling:EC2_INSTANCE_TERMINATING  (300-600s)
# *-scale-out-hook  → autoscaling:EC2_INSTANCE_LAUNCHING    (300s)
```

### 8.3 View Scheduled Scaling Actions
```bash
for ASG in prod-frontend-asg prod-backend-asg; do
  echo "=== Scheduled Actions: $ASG ==="
  aws autoscaling describe-scheduled-actions \
    --auto-scaling-group-name "$ASG" \
    --region us-east-1 \
    --query 'ScheduledUpdateGroupActions[*].{Action:ScheduledActionName,Recurrence:Recurrence,Min:MinSize,Desired:DesiredCapacity}' \
    --output table
done
```

### 8.4 Connect to Instance via SSM (No SSH Needed)
```bash
# Get a frontend instance ID
FE_INSTANCE=$(aws autoscaling describe-auto-scaling-instances \
  --region us-east-1 \
  --query 'AutoScalingInstances[?AutoScalingGroupName==`prod-frontend-asg`].InstanceId' \
  --output text | awk '{print $1}')

echo "Connecting to: $FE_INSTANCE"

# Open SSM session
aws ssm start-session --target "$FE_INSTANCE" --region us-east-1
```

Once connected, run these checks:
```bash
# Check PM2 processes
sudo pm2 list

# Check app logs
sudo pm2 logs family-finance-frontend --lines 30

# Check app is listening on port 3000
sudo ss -tlnp | grep 3000

# Test health endpoint locally
curl -s localhost:3000/health | python3 -m json.tool

# Check CloudWatch agent
sudo systemctl status amazon-cloudwatch-agent

# Check user data completed
tail -5 /var/log/user-data.log
# Last line should be: === Frontend bootstrap complete ===

# Check environment variables loaded
cat /opt/family-finance-frontend/.env.production
```

### 8.5 Check Scaling Policies Are Active
```bash
aws autoscaling describe-policies \
  --auto-scaling-group-name prod-frontend-asg \
  --region us-east-1 \
  --query 'ScalingPolicies[*].{Name:PolicyName,Type:PolicyType,Adjustment:TargetTrackingConfiguration.TargetValue}' \
  --output table
```

---

## Step 9 – Verify DynamoDB

### 9.1 Check Table Status
```bash
aws dynamodb describe-table \
  --table-name prod-family-finance \
  --region us-east-1 \
  --query 'Table.{
    Status:TableStatus,
    BillingMode:BillingModeSummary.BillingMode,
    StreamEnabled:StreamSpecification.StreamEnabled,
    StreamType:StreamSpecification.StreamViewType,
    PITR:PointInTimeRecoveryDescription.PointInTimeRecoveryStatus,
    Encryption:SSEDescription.Status
  }' \
  --output table

# Expected:
# Status:       ACTIVE
# BillingMode:  PAY_PER_REQUEST
# StreamEnabled: true
# StreamType:   NEW_AND_OLD_IMAGES
# PITR:         ENABLED
# Encryption:   ENABLED
```

### 9.2 Check GSIs
```bash
aws dynamodb describe-table \
  --table-name prod-family-finance \
  --region us-east-1 \
  --query 'Table.GlobalSecondaryIndexes[*].{Name:IndexName,Status:IndexStatus,Keys:KeySchema[*].AttributeName}' \
  --output table

# Expected:
# GSI1-UserDate     → ACTIVE
# GSI2-CategoryDate → ACTIVE
```

### 9.3 Write and Read a Test Item
```bash
# Write
aws dynamodb put-item \
  --table-name prod-family-finance \
  --region us-east-1 \
  --item '{
    "PK":     {"S": "USER#verify001"},
    "SK":     {"S": "PROFILE#verify001"},
    "name":   {"S": "Verification User"},
    "email":  {"S": "verify@test.com"},
    "GSI1PK": {"S": "USER#verify001"},
    "GSI1SK": {"S": "2024-01-01"}
  }'
echo "Write: OK"

# Read
aws dynamodb get-item \
  --table-name prod-family-finance \
  --region us-east-1 \
  --key '{"PK":{"S":"USER#verify001"},"SK":{"S":"PROFILE#verify001"}}' \
  --query 'Item.{PK:PK.S,SK:SK.S,Name:name.S}' \
  --output table

# Cleanup
aws dynamodb delete-item \
  --table-name prod-family-finance \
  --region us-east-1 \
  --key '{"PK":{"S":"USER#verify001"},"SK":{"S":"PROFILE#verify001"}}'
echo "Cleanup: OK"
```

### 9.4 Confirm DynamoDB Audit Logs Are Flowing
After the write test, confirm the stream logger Lambda published to CloudWatch:
```bash
# Wait ~30 seconds for Lambda to process the stream event
sleep 30

aws logs describe-log-streams \
  --log-group-name /aws/dynamodb/prod/streams \
  --region us-east-1 \
  --order-by LastEventTime \
  --descending \
  --query 'logStreams[0].{Stream:logStreamName,LastEvent:lastEventTime}' \
  --output table

# Fetch and display latest events
STREAM=$(aws logs describe-log-streams \
  --log-group-name /aws/dynamodb/prod/streams \
  --order-by LastEventTime --descending \
  --query 'logStreams[0].logStreamName' --output text --region us-east-1)

aws logs get-log-events \
  --log-group-name /aws/dynamodb/prod/streams \
  --log-stream-name "$STREAM" \
  --region us-east-1 --limit 5 \
  --query 'events[*].message' \
  --output text | python3 -m json.tool 2>/dev/null || echo "(raw output above)"
```

---

## Step 10 – Verify CloudWatch & Alarms

### 10.1 Confirm All Log Groups Exist
```bash
aws logs describe-log-groups \
  --region us-east-1 \
  --query 'logGroups[*].{Name:logGroupName,RetentionDays:retentionInDays}' \
  --output table | grep -E "family-finance|dynamodb/prod|lambda/prod"
```

Expected log groups:
```
/aws/ec2/prod/backend                    ← backend app + error logs
/aws/ec2/prod/frontend                   ← frontend app logs
/aws/dynamodb/prod/streams               ← DynamoDB CDC audit trail
/aws/lambda/prod-slack-notifier          ← Slack notifier Lambda logs
/aws/lambda/prod-dynamodb-stream-logger  ← Stream logger Lambda logs
/aws/vpc/prod/flow-logs                  ← Network traffic audit
```

### 10.2 Check Metric Filters Are Created
```bash
aws logs describe-metric-filters \
  --log-group-name /aws/ec2/prod/backend \
  --region us-east-1 \
  --query 'metricFilters[*].{Name:filterName,Pattern:filterPattern,Metric:metricTransformations[0].metricName}' \
  --output table

# Expected 3 filters:
# prod-backend-error-filter     → [ERROR]
# prod-backend-5xx-filter       → "statusCode":5
# prod-backend-exception-filter → (Exception OR TypeError OR ReferenceError)
```

### 10.3 Check All Alarms Status
```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix prod- \
  --region us-east-1 \
  --query 'MetricAlarms[*].{Alarm:AlarmName,State:StateValue}' \
  --output table

# All should be OK or INSUFFICIENT_DATA (not ALARM) at initial deployment
# INSUFFICIENT_DATA means no data yet — normal for new deployment
```

### 10.4 Open CloudWatch Dashboard in Browser
```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION="us-east-1"

echo "Dashboard URL:"
echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=prod-family-finance"
```

The dashboard contains 6 panels:
- Backend Error Rate
- Backend 5XX Count
- ALB 5XX Errors + Target Response Time
- Frontend + Backend CPU Utilization
- DynamoDB System Errors & Throttles
- All Alarms Status widget

---

## Step 11 – Verify SNS → Lambda → Slack

### 11.1 Confirm SNS Topic and Lambda Subscription
```bash
SNS_ARN=$(terraform output -raw sns_topic_arn)

aws sns list-subscriptions-by-topic \
  --topic-arn "$SNS_ARN" \
  --region us-east-1 \
  --query 'Subscriptions[*].{Protocol:Protocol,Endpoint:Endpoint,Status:SubscriptionArn}' \
  --output table

# Expected: 1 subscription — Protocol=lambda, Status=confirmed (not PendingConfirmation)
```

### 11.2 Verify Lambda Is Active
```bash
aws lambda get-function \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --query 'Configuration.{State:State,Runtime:Runtime,Handler:Handler}' \
  --output table

# State: Active
# Runtime: python3.12
# Handler: slack_notifier.handler
```

### 11.3 Verify Slack Webhook Is Set
```bash
aws lambda get-function-configuration \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --query 'Environment.Variables' \
  --output json

# Expected:
# {
#   "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
#   "ENVIRONMENT": "prod",
#   "AWS_REGION": "us-east-1"    ← Note: Lambda sets this automatically; may be in env
# }
```

### 11.4 Test Lambda Directly
```bash
aws lambda invoke \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{
    "Records": [{
      "Sns": {
        "Message": "{\"AlarmName\":\"prod-TEST-alarm\",\"AlarmDescription\":\"Infrastructure verification test\",\"NewStateValue\":\"ALARM\",\"OldStateValue\":\"OK\",\"NewStateReason\":\"Manual test - pipeline working!\",\"StateChangeTime\":\"2024-01-01T12:00:00.000Z\",\"Trigger\":{\"Namespace\":\"FamilyFinance/Test\",\"MetricName\":\"TestMetric\"}}"
      }
    }]
  }' \
  /tmp/lambda-test-response.json

cat /tmp/lambda-test-response.json
# Expected: {"statusCode": 200, "body": "OK"}
```

Check your **Slack channel** — you should see a red alert card within 10 seconds.

### 11.5 Test Full CW Alarm → SNS → Lambda → Slack Chain
```bash
# Trigger the alarm manually
aws cloudwatch set-alarm-state \
  --alarm-name prod-backend-high-error-rate \
  --state-value ALARM \
  --state-reason "Verification test — checking full alerting pipeline" \
  --region us-east-1

echo "Alarm triggered. Check Slack in ~30 seconds."

# After confirming Slack received it, reset to OK
sleep 60
aws cloudwatch set-alarm-state \
  --alarm-name prod-backend-high-error-rate \
  --state-value OK \
  --state-reason "Verification complete — resetting alarm state" \
  --region us-east-1

echo "Alarm reset to OK. Check Slack for green recovery message."
```

### 11.6 View Lambda Execution Logs
```bash
aws logs tail /aws/lambda/prod-slack-notifier \
  --region us-east-1 \
  --since 1h \
  --format short
```

---

## Step 12 – Smoke Test End-to-End

### 12.1 DNS Resolution
```bash
# Resolve the domain
dig familyfinance.io A +short
# Should return 2-3 IP addresses (ALB nodes across AZs)

# Check www also resolves
dig www.familyfinance.io A +short
```

### 12.2 Full Traffic Flow Test
```bash
echo "=== HTTP → HTTPS Redirect ==="
curl -sI http://familyfinance.io | grep -E "HTTP/|Location:"
# Expected: HTTP/1.1 301 | Location: https://familyfinance.io/

echo ""
echo "=== HTTPS Response ==="
curl -s -o /dev/null -w "Status: %{http_code} | Time: %{time_total}s | Size: %{size_download} bytes\n" \
  https://familyfinance.io/

echo ""
echo "=== Frontend Health ==="
curl -s https://familyfinance.io/health | python3 -m json.tool

echo ""
echo "=== Backend API Health (via frontend proxy) ==="
curl -s https://familyfinance.io/api/health | python3 -m json.tool

echo ""
echo "=== TLS Certificate Details ==="
echo | openssl s_client -connect familyfinance.io:443 -servername familyfinance.io 2>/dev/null \
  | openssl x509 -noout -subject -issuer -enddate
# issuer should be: Amazon
# enddate: ~13 months from now (ACM auto-renews)
```

### 12.3 Multi-AZ Verification
Send multiple requests and verify responses come from different AZs:
```bash
for i in {1..10}; do
  curl -s -o /dev/null -w "Request $i: HTTP %{http_code} | Time: %{time_total}s\n" \
    https://familyfinance.io/api/health
done
# All should return HTTP 200
```

### 12.4 Test Scale-Out (Optional)
```bash
# Install Apache Bench (quick load test)
# macOS: brew install httpd
# Linux: sudo dnf install httpd-tools

ab -n 1000 -c 50 https://familyfinance.io/
# Watch ASG instance count increase in CloudWatch after CPU crosses 60%

# Monitor ASG
watch -n 10 'aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names prod-frontend-asg \
  --query "AutoScalingGroups[0].{Desired:DesiredCapacity,Running:length(Instances)}" \
  --output table --region us-east-1'
```

---

## Step 13 – Grafana Setup

### Option A – Grafana Cloud (Quickest)

1. Go to **grafana.com** → Sign up → New Stack
2. **Connections → Data Sources → Add → CloudWatch**
3. Create a read-only IAM user for Grafana:

```bash
# Create user
aws iam create-user --user-name grafana-cloudwatch-reader --region us-east-1

# Attach CloudWatch read-only policy
aws iam attach-user-policy \
  --user-name grafana-cloudwatch-reader \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchReadOnlyAccess

# Create access key
aws iam create-access-key \
  --user-name grafana-cloudwatch-reader \
  --query 'AccessKey.{ID:AccessKeyId,Secret:SecretAccessKey}' \
  --output table
# Save these credentials — enter them in Grafana Data Source config
```

4. In Grafana Data Source config:
   - **Authentication Provider:** Access & Secret Key
   - **Access Key ID / Secret:** from above
   - **Default Region:** `us-east-1`
   - Click **Save & Test** → green checkmark expected

### Option B – Self-Hosted Grafana on EC2

Deploy Grafana on a t3.small in a public subnet:
```bash
# Via SSM on a dedicated EC2, or add to user-data:
sudo dnf install -y grafana

# Edit grafana.ini for your domain
sudo sed -i 's/;domain = localhost/domain = grafana.familyfinance.io/' \
  /etc/grafana/grafana.ini

sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Access at http://INSTANCE_IP:3000
# Default login: admin / admin (change immediately)
```

### Key Dashboard Panels to Create

| Panel Title | Data Source | Namespace | Metric | Dimension |
|-------------|-------------|-----------|--------|-----------|
| Frontend CPU % | CloudWatch | FamilyFinance/Frontend | cpu_usage_user | AutoScalingGroupName=prod-frontend-asg |
| Backend CPU % | CloudWatch | FamilyFinance/Backend | cpu_usage_user | AutoScalingGroupName=prod-backend-asg |
| Memory Used % | CloudWatch | FamilyFinance/Backend | mem_used_percent | InstanceId |
| ALB Request Count | CloudWatch | AWS/ApplicationELB | RequestCount | LoadBalancer |
| ALB 5XX Errors | CloudWatch | AWS/ApplicationELB | HTTPCode_Target_5XX_Count | LoadBalancer |
| ALB P99 Latency | CloudWatch | AWS/ApplicationELB | TargetResponseTime (p99) | LoadBalancer |
| Backend Error Logs | CloudWatch | FamilyFinance/Backend | BackendErrorCount | (metric filter) |
| DynamoDB Errors | CloudWatch | AWS/DynamoDB | SystemErrors | TableName=prod-family-finance |
| ASG Instance Count | CloudWatch | AWS/AutoScaling | GroupInServiceInstances | AutoScalingGroupName |
| NAT GW Bytes | CloudWatch | AWS/NATGateway | BytesOutToInternet | NatGatewayId |

---

## Security Hardening Checklist

Run through this after deployment:

### Network Security
- [ ] No EC2 instances have public IPs (all in private subnets)
- [ ] Backend EC2s only reachable from Internal LB SG (not from internet at all)
- [ ] SSH (port 22) only accessible from `10.0.0.0/16` (internal) — no `0.0.0.0/0`
- [ ] VPC Flow Logs capturing ALL traffic
- [ ] VPC Gateway Endpoints in use for DynamoDB and S3
- [ ] VPC Interface Endpoint in use for CloudWatch Logs

### TLS / Certificate
- [ ] HTTP 301 → HTTPS redirect verified
- [ ] TLS policy `ELBSecurityPolicy-TLS13-1-2-2021-06` (no TLS 1.0/1.1)
- [ ] ACM certificate auto-renews (no manual renewal needed)
- [ ] No wildcard exposure — `*.familyfinance.io` cert is only on your ALB

### EC2 Hardening
- [ ] IMDSv2 enforced on all Launch Templates (`http_tokens = "required"`)
- [ ] No hardcoded AWS credentials in code or environment files
- [ ] EBS root volumes encrypted at rest
- [ ] SSM Session Manager used for access (no open port 22 to internet)
- [ ] AL2023 AMI regularly updated (set up Patch Manager or re-apply with new AMI)

### WAF Rules Active
- [ ] AWSManagedRulesCommonRuleSet (OWASP Top 10)
- [ ] AWSManagedRulesKnownBadInputsRuleSet (log4j, SSRF, etc.)
- [ ] AWSManagedRulesBotControlRuleSet (scrapers, crawlers)
- [ ] AWSManagedRulesAmazonIpReputationList (known malicious IPs)
- [ ] Rate limiting: 2000 req / 5 min per IP

### DynamoDB
- [ ] Server-side encryption enabled (AWS managed key)
- [ ] PITR enabled (restore to any second within 35 days)
- [ ] Access only via EC2 IAM instance role (no API keys)
- [ ] DynamoDB traffic via VPC Gateway Endpoint (never traverses internet)

### IAM Least Privilege
- [ ] EC2 role only has DynamoDB + CloudWatch Logs + SSM + ASG lifecycle
- [ ] Lambda roles scoped to specific log groups / SNS topics
- [ ] No `Resource: "*"` except CloudWatch Logs (required by CloudWatch agent)

### Monitoring & Alerting
- [ ] All 8 CloudWatch alarms tested (set to ALARM manually → Slack fired)
- [ ] DynamoDB stream logs flowing to CloudWatch
- [ ] VPC Flow Logs active and searchable in CloudWatch Logs Insights
- [ ] ALB access logs being written to S3

---

## Cost Estimation

Approximate monthly cost (us-east-1, prod workload):

| Resource | Qty | Est. Monthly |
|----------|-----|-------------|
| t3.small EC2 (frontend, min 2) | 2 | $30 |
| t3.medium EC2 (backend, min 2) | 2 | $60 |
| NAT Gateway (3 AZs) | 3 | $97 |
| External ALB | 1 | $20 |
| Internal ALB | 1 | $18 |
| DynamoDB on-demand | 1 | $5–50 |
| WAF WebACL + rules | 1 | $10 |
| CloudWatch Logs (ingestion + storage) | — | $10–25 |
| Lambda invocations | — | $1 |
| Route 53 Hosted Zone | 1 | $1 |
| ACM Certificate | 1 | Free |
| S3 (ALB access logs) | — | $1 |
| **Total estimate** | | **$250–310/mo** |

**Top cost reduction levers:**
1. NAT Gateways are the biggest cost ($97/mo). In staging, use a single shared NAT GW
2. EC2 Savings Plans save ~30-40% on compute
3. Scheduled scale-down already configured (nights + weekends)

---

## Troubleshooting

### Instance Shows Unhealthy in Target Group

```bash
# Step 1: Find the instance and connect via SSM
INSTANCE=$(aws autoscaling describe-auto-scaling-instances \
  --query 'AutoScalingInstances[?AutoScalingGroupName==`prod-frontend-asg`].InstanceId' \
  --output text --region us-east-1 | awk '{print $1}')

aws ssm start-session --target "$INSTANCE" --region us-east-1

# Step 2: Inside the session, check:
sudo pm2 list                              # Is PM2 running?
sudo pm2 logs --lines 50                   # Any startup errors?
sudo ss -tlnp | grep 3000                  # Is port 3000 open?
curl -v localhost:3000/health              # Does health check pass?
tail -50 /var/log/user-data.log           # Did bootstrap complete?
sudo systemctl status amazon-cloudwatch-agent  # Is CW agent running?
```

### ACM Certificate Stuck in PENDING_VALIDATION

```bash
# Check DNS validation records exist in Route 53
ZONE_ID=$(aws route53 list-hosted-zones \
  --query 'HostedZones[?Name==`familyfinance.io.`].Id' \
  --output text | sed 's|/hostedzone/||')

aws route53 list-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --query 'ResourceRecordSets[?Type==`CNAME`].{Name:Name,Value:ResourceRecords[0].Value}' \
  --output table

# Verify GoDaddy is delegated to Route 53
dig NS familyfinance.io
# Must show awsdns-XX.com records
# If still showing GoDaddy NS: the delegation hasn't propagated yet. Wait 30-60 min.
```

### Backend Logs Not in CloudWatch

```bash
# Connect to backend instance via SSM and check:
sudo systemctl status amazon-cloudwatch-agent
cat /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log | tail -20

# Common fix: IAM role missing CloudWatch Logs permissions
INSTANCE_ROLE=$(aws iam list-instance-profiles \
  --query 'InstanceProfiles[?contains(InstanceProfileName, `prod-ec2`)].Roles[0].RoleName' \
  --output text --region us-east-1)

aws iam simulate-principal-policy \
  --policy-source-arn "arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/$INSTANCE_ROLE" \
  --action-names logs:PutLogEvents \
  --resource-arns "*" \
  --query 'EvaluationResults[0].EvalDecision'
# Must return: allowed
```

### Slack Alerts Not Arriving

```bash
# 1. Check Lambda environment variables are set
aws lambda get-function-configuration \
  --function-name prod-slack-notifier --region us-east-1 \
  --query 'Environment.Variables'

# 2. Test Lambda directly with a test payload
aws lambda invoke \
  --function-name prod-slack-notifier \
  --region us-east-1 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"Records":[{"Sns":{"Message":"{\"AlarmName\":\"test\",\"NewStateValue\":\"ALARM\",\"OldStateValue\":\"OK\",\"NewStateReason\":\"test\",\"StateChangeTime\":\"2024-01-01T00:00:00Z\",\"Trigger\":{\"Namespace\":\"Test\",\"MetricName\":\"test\"}}"}}]}' \
  /tmp/out.json && cat /tmp/out.json

# 3. Tail Lambda execution logs
aws logs tail /aws/lambda/prod-slack-notifier --region us-east-1 --since 5m

# 4. Confirm SNS subscription is confirmed (not PendingConfirmation)
aws sns list-subscriptions-by-topic \
  --topic-arn "$(terraform output -raw sns_topic_arn)" \
  --query 'Subscriptions[*].{Protocol:Protocol,Status:SubscriptionArn}' \
  --output table
```

### Terraform Apply Fails on Module Dependency

```bash
# If you get a dependency error, apply modules in order:
terraform apply -target=module.vpc
terraform apply -target=module.security_groups
terraform apply -target=module.waf
terraform apply -target=module.alb
terraform apply -target=module.dynamodb
terraform apply -target=module.monitoring
terraform apply -target=module.asg
terraform apply     # final pass
```

---

## Rollback Procedures

### Roll Back a Single Module (e.g., after bad WAF rule)
```bash
# Revert specific module to previous state
git checkout HEAD~1 -- modules/waf/
terraform apply -target=module.waf
```

### Roll Back EC2 Instances (Instance Refresh)
```bash
# Trigger rolling refresh of frontend instances
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name prod-frontend-asg \
  --strategy Rolling \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":300}' \
  --region us-east-1

# Monitor progress
aws autoscaling describe-instance-refreshes \
  --auto-scaling-group-name prod-frontend-asg \
  --region us-east-1 \
  --query 'InstanceRefreshes[0].{Status:Status,Percentage:PercentageComplete}' \
  --output table
```

### Restore DynamoDB to Point-in-Time
```bash
# Restore to 1 hour ago
RESTORE_TIME=$(date -d '-1 hour' -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
               date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)

aws dynamodb restore-table-to-point-in-time \
  --source-table-name prod-family-finance \
  --target-table-name prod-family-finance-restored \
  --restore-date-time "$RESTORE_TIME" \
  --region us-east-1

echo "Restore started. Monitor:"
echo "aws dynamodb describe-table --table-name prod-family-finance-restored --query 'Table.TableStatus'"
```

### Full Infrastructure Destroy
```bash
# WARNING: Destroys all infrastructure including DynamoDB data
# Backup DynamoDB first if needed

# Create backup
aws dynamodb create-backup \
  --table-name prod-family-finance \
  --backup-name "pre-destroy-backup-$(date +%Y%m%d)" \
  --region us-east-1

# Destroy all
terraform destroy
# Type 'yes' when prompted
```

---

*Infrastructure managed by Terraform | AWS us-east-1 | Multi-AZ HA*
*For Grafana dashboards, use CloudWatch as data source with read-only IAM credentials*
*Estimated cost: $250–310/month at minimum capacity*
