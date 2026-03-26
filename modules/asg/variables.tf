variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_ids" {
  type = list(string)
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "frontend_sg_id" {
  type = string
}

variable "backend_sg_id" {
  type = string
}

variable "frontend_tg_arn" {
  type = string
}

variable "backend_tg_arn" {
  type = string
}

variable "frontend_ami" {
  type = string
}

variable "backend_ami" {
  type = string
}

variable "frontend_instance_type" {
  type = string
}

variable "backend_instance_type" {
  type = string
}

variable "github_repo_frontend" {
  type = string
}

variable "github_repo_backend" {
  type = string
}

variable "dynamodb_table_name" {
  description = "Name of the original monitoring/stream table (kept for CloudWatch compatibility)"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "ARN of the original monitoring/stream table (kept for backwards compat)"
  type        = string
}



variable "aws_region" {
  type = string
}

variable "backend_log_group_name" {
  type = string
}

variable "frontend_log_group_name" {
  type = string
}

variable "key_name" {
  type = string
}

variable "internal_lb_dns" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "external_alb_arn" {
  description = "ARN of the external ALB — required for ALBRequestCountPerTarget resource_label"
  type        = string
}

variable "frontend_subnet_ids" {
  description = "Private-frontend subnet IDs — where frontend EC2 instances launch"
  type        = list(string)
}

variable "backend_subnet_ids" {
  description = "Private-backend subnet IDs — where backend EC2 instances launch"
  type        = list(string)
}
