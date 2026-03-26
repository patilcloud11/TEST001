output "external_alb_dns" {
  value = aws_lb.external.dns_name
}

output "internal_lb_dns" {
  value = aws_lb.internal.dns_name
}

output "frontend_tg_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "backend_tg_arn" {
  value = aws_lb_target_group.backend.arn
}

output "acm_certificate_arn" {
  value = aws_acm_certificate.main.arn
}

output "external_alb_arn" {
  description = "Full ARN of the external ALB — used to build ALBRequestCountPerTarget resource_label"
  value       = aws_lb.external.arn
}
