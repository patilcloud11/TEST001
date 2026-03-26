###############################################################################
# Root Variables
###############################################################################

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (prod / staging)"
  type        = string
  default     = "prod"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "AZs to deploy into"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "domain_name" {
  description = "Root domain managed in Route 53 (e.g. familyfinance.io)"
  type        = string
}

variable "slack_webhook_url" {
  description = "Slack Incoming Webhook URL for alerts"
  type        = string
  sensitive   = true
}

variable "frontend_ami" {
  description = "AMI ID for frontend instances (Amazon Linux 2023)"
  type        = string
  default     = "ami-0c101f26f147fa7fd" # us-east-1 AL2023
}

variable "backend_ami" {
  description = "AMI ID for backend instances (Amazon Linux 2023)"
  type        = string
  default     = "ami-0c101f26f147fa7fd"
}

variable "frontend_instance_type" {
  description = "EC2 instance type for frontend"
  type        = string
  default     = "t3.small"
}

variable "backend_instance_type" {
  description = "EC2 instance type for backend"
  type        = string
  default     = "t3.medium"
}

variable "github_repo_frontend" {
  description = "GitHub HTTPS URL for frontend repo"
  type        = string
}

variable "github_repo_backend" {
  description = "GitHub HTTPS URL for backend repo"
  type        = string
}

variable "key_name" {
  description = "EC2 Key Pair name for SSH access"
  type        = string
}
