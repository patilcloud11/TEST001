###############################################################################
# Module: Security Groups
# 
# Traffic flow:
#   Internet → ALB SG (80/443)
#   ALB SG   → Frontend SG (3000)
#   Frontend SG → Internal LB SG (80)
#   Internal LB SG → Backend SG (5000)
#   Backend SG → DynamoDB (via VPC endpoint, no SG needed)
###############################################################################

###############################################################################
# 1. External ALB Security Group
#    Source: 0.0.0.0/0  (internet traffic)
###############################################################################
resource "aws_security_group" "alb" {
  name        = "${var.environment}-alb-sg"
  description = "External ALB allow HTTP/HTTPS from internet"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from internet"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from internet"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound to frontend instances"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-alb-sg" }
}

###############################################################################
# 2. Frontend Instance Security Group
#    Source: ALB SG only  (principle of least privilege)
###############################################################################
resource "aws_security_group" "frontend" {
  name        = "${var.environment}-frontend-sg"
  description = "Frontend EC2 accept traffic only from external ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # SSH bastion access (restrict to your bastion / VPN CIDR in prod)
  ingress {
    description = "SSH restrict to bastion/VPN CIDR in prod"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"] # internal only
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-frontend-sg" }
}

###############################################################################
# 3. Internal Load Balancer Security Group
#    Source: Frontend SG only
###############################################################################
resource "aws_security_group" "internal_lb" {
  name        = "${var.environment}-internal-lb-sg"
  description = "Internal ALB accept traffic only from frontend instances"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from frontend instances"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.frontend.id]
  }

  egress {
    description = "Forward to backend instances"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-internal-lb-sg" }
}

###############################################################################
# 4. Backend Instance Security Group
#    Source: Internal LB SG only
###############################################################################
resource "aws_security_group" "backend" {
  name        = "${var.environment}-backend-sg"
  description = "Backend EC2 accept traffic only from internal ALB"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from internal LB"
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.internal_lb.id]
  }

  ingress {
    description = "SSH internal only"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  egress {
    description = "Outbound for DynamoDB, CloudWatch, NAT"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.environment}-backend-sg" }
}
