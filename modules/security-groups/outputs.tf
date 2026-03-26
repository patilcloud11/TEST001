output "alb_sg_id" {
  value = aws_security_group.alb.id
}

output "frontend_sg_id" {
  value = aws_security_group.frontend.id
}

output "internal_lb_sg_id" {
  value = aws_security_group.internal_lb.id
}

output "backend_sg_id" {
  value = aws_security_group.backend.id
}
