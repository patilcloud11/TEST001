###############################################################################
# Module: Monitoring – Variables
###############################################################################
variable "environment" {
  type = string
}

variable "slack_webhook_url" {
  type      = string
  sensitive = true
}

variable "dynamodb_table_name" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "account_id" {
  type = string
}
