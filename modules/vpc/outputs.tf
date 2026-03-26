output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_frontend_ids" {
  value = aws_subnet.private_frontend[*].id
}

output "private_backend_ids" {
  value = aws_subnet.private_backend[*].id
}

output "private_data_ids" {
  value = aws_subnet.private_data[*].id
}

# Alias used by root module for frontend subnets
output "private_subnet_ids" {
  value = aws_subnet.private_frontend[*].id
}
