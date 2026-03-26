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
  type        = list(string)
  description = "Private-frontend subnet IDs internal ALB is placed here so frontend EC2s can reach it"
}

variable "backend_subnet_ids" {
  type        = list(string)
  description = "Private-backend subnet IDs backend EC2 instances register into the backend target group"
}

variable "alb_sg_id" {
  type = string
}

variable "internal_lb_sg_id" {
  type = string
}

variable "domain_name" {
  type = string
}

variable "waf_acl_arn" {
  type = string
}
