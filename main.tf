###############################################################################
# AI-Powered Family Finance Management – Root Main
# Region: us-east-1  |  Multi-AZ  |  3-Tier Architecture
###############################################################################

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  #Recommended: use S3 backend for team collaboration
  backend "s3" {
    bucket         = "tf-state-family-finance-680210253112"
    key            = "family-finance/prod/terraform.tfstate"
    region         = "us-east-1"
    use_lockfile   = true
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "FamilyFinanceAI"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

###############################################################################
# VPC
###############################################################################
module "vpc" {
  source      = "./modules/vpc"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
  azs         = var.availability_zones
}

###############################################################################
# Security Groups
###############################################################################
module "security_groups" {
  source      = "./modules/security-groups"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

###############################################################################
# WAF (attached to external ALB)
###############################################################################
module "waf" {
  source      = "./modules/waf"
  environment = var.environment
}

###############################################################################
# External ALB (Internet-facing) + ACM
###############################################################################
module "alb" {
  source    = "./modules/alb"
  environment = var.environment
  vpc_id    = module.vpc.vpc_id

  # ── Subnet wiring ───────────────────────────────────────────────────────
  # External ALB  → public subnets        (internet-facing)
  # Internal ALB  → private-frontend subnets (frontend EC2s reach it here)
  # Backend TG    → backend EC2s are in private-backend subnets
  public_subnet_ids  = module.vpc.public_subnet_ids     # external ALB
  private_subnet_ids = module.vpc.private_frontend_ids  # internal ALB placement
  backend_subnet_ids = module.vpc.private_backend_ids   # backend target group EC2s

  alb_sg_id         = module.security_groups.alb_sg_id
  internal_lb_sg_id = module.security_groups.internal_lb_sg_id
  domain_name       = var.domain_name
  waf_acl_arn       = module.waf.waf_acl_arn
}

###############################################################################
# DynamoDB
###############################################################################
module "dynamodb" {
  source      = "./modules/dynamodb"
  environment = var.environment
}

###############################################################################
# Monitoring (CloudWatch, SNS, Lambda→Slack)
###############################################################################
module "monitoring" {
  source              = "./modules/monitoring"
  environment         = var.environment
  slack_webhook_url   = var.slack_webhook_url
  dynamodb_table_name = module.dynamodb.table_name
  aws_region          = var.aws_region
  account_id          = data.aws_caller_identity.current.account_id
}

###############################################################################
# ASG – Frontend
###############################################################################
module "asg" {
  source      = "./modules/asg"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id

  # ── Subnet wiring (3-tier) ───────────────────────────────────────────────
  # public_subnet_ids   → NOT used by ASG (ALB lives here, not EC2)
  # frontend_subnet_ids → private-frontend tier (10.0.10/24, 10.0.11/24, 10.0.12/24)
  # backend_subnet_ids  → private-backend tier  (10.0.20/24, 10.0.21/24, 10.0.22/24)
  public_subnet_ids   = module.vpc.public_subnet_ids    # kept for reference / future use
  private_subnet_ids  = module.vpc.private_frontend_ids # kept for compatibility
  frontend_subnet_ids = module.vpc.private_frontend_ids # frontend EC2 → private-frontend subnets
  backend_subnet_ids  = module.vpc.private_backend_ids  # backend EC2  → private-backend subnets

  frontend_sg_id         = module.security_groups.frontend_sg_id
  backend_sg_id          = module.security_groups.backend_sg_id
  frontend_tg_arn        = module.alb.frontend_tg_arn
  backend_tg_arn         = module.alb.backend_tg_arn
  frontend_ami           = var.frontend_ami
  backend_ami            = var.backend_ami
  frontend_instance_type = var.frontend_instance_type
  backend_instance_type  = var.backend_instance_type
  github_repo_frontend   = var.github_repo_frontend
  github_repo_backend    = var.github_repo_backend
  dynamodb_table_name    = module.dynamodb.table_name
  dynamodb_table_arn     = module.dynamodb.table_arn
  aws_region             = var.aws_region
  backend_log_group_name  = module.monitoring.backend_log_group_name
  frontend_log_group_name = module.monitoring.frontend_log_group_name
  key_name               = var.key_name
  internal_lb_dns        = module.alb.internal_lb_dns
  domain_name            = var.domain_name
  external_alb_arn       = module.alb.external_alb_arn
}

###############################################################################
# Data Sources
###############################################################################
data "aws_caller_identity" "current" {}
