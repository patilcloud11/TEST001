###############################################################################
#  terraform.tfvars
#  AI-Powered Family Finance Management System
#  Infrastructure: AWS us-east-1 | Multi-AZ | 3-Tier
#
#  HOW TO USE:
#  1. Fill in every value marked  ← CHANGE THIS
#  2. Values marked  ← OPTIONAL  have safe defaults, change if needed
#  3. Run:  terraform init && terraform validate && terraform plan
###############################################################################


###############################################################################
# 1. AWS REGION & ENVIRONMENT
###############################################################################

aws_region = "us-east-1"

# Environment tag applied to every AWS resource.
# Use "prod" for production, "staging" for staging.
environment = "prod"


###############################################################################
# 2. NETWORKING
###############################################################################

# VPC IP range. 10.0.0.0/16 gives you 65,536 IPs across all subnets.
# DO NOT change this after deployment — it requires full teardown.
vpc_cidr = "10.0.0.0/16"

# Three AZs for high availability.
# us-east-1 has 6 AZs — a/b/c are always available.
availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]


###############################################################################
# 3. DOMAIN NAME  ← CHANGE THIS
#
# This must be a domain you OWN and have moved to Route 53.
# Steps before terraform apply:
#   1. Buy domain on GoDaddy (or anywhere)
#   2. Create Route 53 Hosted Zone:
#        aws route53 create-hosted-zone --name YOUR_DOMAIN --caller-reference $(date +%s)
#   3. Copy the 4 NS records from Route 53 into GoDaddy nameservers
#   4. Wait 15-30 min for DNS propagation, then run terraform apply
#
# Example values:
#   "familyfinance.io"
#   "myfinanceapp.com"
#   "financemanager.in"
###############################################################################

domain_name = "global-aws.site"   # ← CHANGE THIS to your actual domain


###############################################################################
# 4. SLACK WEBHOOK URL  ← CHANGE THIS
#
# Used by Lambda to send CloudWatch alarm alerts to your Slack channel.
#
# How to get your Slack webhook URL:
#   1. Go to https://api.slack.com/apps
#   2. Click "Create New App" → "From scratch"
#   3. Name it "Finance Alerts", select your workspace
#   4. Click "Incoming Webhooks" → toggle ON
#   5. Click "Add New Webhook to Workspace"
#   6. Select the channel (e.g. #prod-alerts) → Allow
#   7. Copy the webhook URL that looks like:
#      https://hooks.slack.com/services/T.../B.../...
#
# SECURITY TIP: Instead of putting it here, set as env var:
#   export TF_VAR_slack_webhook_url="https://hooks.slack.com/services/..."
#   Then remove slack_webhook_url from this file entirely.
###############################################################################

slack_webhook_url = "REPLACE_WITH_GITHUB_SECRET"   # ← MOVED TO GITHUB SECRETS


###############################################################################
# 5. EC2 AMI IDs
#
# Amazon Linux 2023 in us-east-1.
# To get the LATEST AMI ID at deploy time, run:
#   aws ssm get-parameter \
#     --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
#     --query Parameter.Value --output text --region us-east-1
#
# Current value as of March 2026 — update before deploying:
###############################################################################

frontend_ami = "ami-02dfbd4ff395f2a1b"   # Amazon Linux 2023, us-east-1  ← verify latest
backend_ami  = "ami-02dfbd4ff395f2a1b"   # Same AMI for both tiers        ← verify latest


###############################################################################
# 6. EC2 INSTANCE TYPES  ← OPTIONAL (change to scale up/down)
#
# Cost guide (us-east-1, On-Demand, per month):
#   t3.micro   ~$7.59   (dev/test only — 1 vCPU, 1GB RAM)
#   t3.small   ~$15.18  (frontend — 2 vCPU, 2GB RAM)  ← current
#   t3.medium  ~$30.37  (backend  — 2 vCPU, 4GB RAM)  ← current
#   t3.large   ~$60.74  (heavy load — 2 vCPU, 8GB RAM)
#   t3.xlarge  ~$121.47 (high traffic backend)
#
# Your app (React + Express + DynamoDB) is lightweight.
# t3.small frontend + t3.medium backend is the right starting point.
###############################################################################

frontend_instance_type = "t3.medium"    # nginx serving static React files
backend_instance_type  = "t3.medium"   # Express.js API + PM2 cluster


###############################################################################
# 7. GITHUB REPOSITORY URLS  ← CHANGE THESE
#
# Use HTTPS format for public repos (no deploy key needed):
#   "https://github.com/YOUR_USERNAME/REPO_NAME.git"
#
# Use SSH format for private repos (deploy key required):
#   "git@github.com:YOUR_USERNAME/REPO_NAME.git"
#
# Your project structure from the zip:
#   family-finance/
#   ├── frontend/   ← this is the frontend repo root
#   └── backend/    ← this is the backend repo root
#
# If both frontend and backend are in ONE monorepo, you have two options:
#   Option A: Push them as separate repos (recommended for clean deployment)
#   Option B: Use the same repo URL for both — the user-data scripts
#             clone the whole repo and the correct subfolder is used
#
# IMPORTANT: The user-data scripts expect:
#   Frontend repo root → contains package.json with "build": "vite build"
#   Backend repo root  → contains server.js at the ROOT level
###############################################################################

github_repo_frontend = "git@github.com:VaibhavJC/dev.git"   # ← CHANGE THIS
github_repo_backend  = "git@github.com:VaibhavJC/dev.git"    # ← CHANGE THIS


###############################################################################
# 8. EC2 KEY PAIR NAME  ← CHANGE THIS
#
# This is the name of the EC2 Key Pair in AWS for emergency SSH access.
# (Normal access uses SSM Session Manager — no SSH port needed)
#
# Create the key pair first:
#   aws ec2 create-key-pair \
#     --key-name family-finance-keypair \
#     --region us-east-1 \
#     --query 'KeyMaterial' \
#     --output text > ~/.ssh/family-finance-keypair.pem
#   chmod 400 ~/.ssh/family-finance-keypair.pem
#
# Then set key_name to the name you used (e.g. "family-finance-keypair")
###############################################################################

key_name = "family-finance-keypair"   # ← CHANGE THIS to your key pair name


###############################################################################
# END OF REQUIRED CONFIGURATION
#
# ─── CHECKLIST BEFORE terraform apply ──────────────────────────────────────
#
#  Pre-Terraform (do these FIRST, one time only):
#  [ ] 1. AWS CLI configured:  aws configure  (region = us-east-1)
#  [ ] 2. EC2 Key Pair created (see step 8 above)
#  [ ] 3. Route 53 Hosted Zone created for your domain
#  [ ] 4. GoDaddy nameservers updated to Route 53 NS records
#  [ ] 5. DNS propagated: dig NS yourdomain.com  (must show awsdns records)
#  [ ] 6. Slack webhook URL obtained and updated above
#  [ ] 7. GitHub repos ready with health check endpoints
#  [ ] 8. SSM secrets stored (run these commands):
#
#         aws ssm put-parameter \
#           --name "/prod/app/jwt-secret" \
#           --value "your-minimum-32-character-jwt-secret-here!" \
#           --type "SecureString" --region us-east-1
#
#         aws ssm put-parameter \
#           --name "/prod/app/groq-api-key" \
#           --value "gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
#           --type "SecureString" --region us-east-1
#
#         aws ssm put-parameter \
#           --name "/prod/app/alpha-vantage-key" \
#           --value "your_alpha_vantage_api_key" \
#           --type "SecureString" --region us-east-1
#
#  Terraform S3 backend (recommended — do once):
#  [ ] 9.  Create S3 bucket for Terraform state:
#          ACCT=$(aws sts get-caller-identity --query Account --output text)
#          aws s3api create-bucket --bucket tf-state-family-finance-$ACCT --region us-east-1
#          aws s3api put-bucket-versioning --bucket tf-state-family-finance-$ACCT \
#            --versioning-configuration Status=Enabled
#
#  [ ] 10. Create DynamoDB lock table:
#          aws dynamodb create-table --table-name terraform-lock \
#            --attribute-definitions AttributeName=LockID,AttributeType=S \
#            --key-schema AttributeName=LockID,KeyType=HASH \
#            --billing-mode PAY_PER_REQUEST --region us-east-1
#
#  [ ] 11. Uncomment the S3 backend block in main.tf and fill in your bucket name
#
#  Deploy:
#  [ ] 12. terraform init
#  [ ] 13. terraform validate        (must show: Success!)
#  [ ] 14. terraform plan -out=tfplan
#  [ ] 15. terraform apply tfplan
#
# ────────────────────────────────────────────────────────────────────────────
###############################################################################
