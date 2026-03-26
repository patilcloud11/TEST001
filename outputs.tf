###############################################################################
# Root Outputs
###############################################################################

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "external_alb_dns" {
  description = "DNS name of the external ALB (point GoDaddy / Route 53 here)"
  value       = module.alb.external_alb_dns
}

output "internal_alb_dns" {
  description = "DNS name of the internal ALB (frontend → backend)"
  value       = module.alb.internal_lb_dns
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = module.dynamodb.table_name
}

output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = module.monitoring.sns_topic_arn
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = module.alb.acm_certificate_arn
}

output "waf_acl_arn" {
  description = "WAF WebACL ARN"
  value       = module.waf.waf_acl_arn
}
