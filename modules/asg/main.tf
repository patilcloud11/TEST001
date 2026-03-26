###############################################################################
# Module: ASG
# - IAM roles for EC2 (SSM, CloudWatch, DynamoDB)
# - Launch Templates with user-data (clone GitHub, install deps, start app)
# - Frontend ASG  (public-facing tier, deploys to private-frontend subnets)
# - Backend ASG   (api tier, deploys to private-backend subnets)
# - Lifecycle hooks for graceful scale-in
# - Scheduled scaling (business hours)
###############################################################################

###############################################################################
# IAM – Instance Role (shared by both tiers, scoped by policy)
###############################################################################
resource "aws_iam_role" "ec2" {
  name = "${var.environment}-ec2-instance-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy" "ec2_custom" {
  name = "${var.environment}-ec2-custom-policy"
  role = aws_iam_role.ec2.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:UpdateItem",
          "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
          "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
          "dynamodb:CreateTable", "dynamodb:DescribeTable", "dynamodb:ListTables",
          "dynamodb:UpdateTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:*:table/finance_*",
          "arn:aws:dynamodb:${var.aws_region}:*:table/finance_*/index/*"
        ]
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup", "logs:CreateLogStream",
          "logs:PutLogEvents", "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
      {
        Sid    = "ASGLifecycle"
        Effect = "Allow"
        Action = ["autoscaling:CompleteLifecycleAction"]
        Resource = "*"
      },
      {
        Sid    = "SSMSecrets"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/prod/app/*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${var.environment}-ec2-instance-profile"
  role = aws_iam_role.ec2.name
}

###############################################################################
# IAM – AutoScaling Lifecycle Hook Role
###############################################################################
resource "aws_iam_role" "asg_lifecycle" {
  name = "${var.environment}-asg-lifecycle-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "autoscaling.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "asg_sns" {
  role       = aws_iam_role.asg_lifecycle.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AutoScalingNotificationAccessRole"
}

###############################################################################
# User Data – Frontend (React / Next.js)
###############################################################################
locals {
  frontend_user_data = base64encode(templatefile("${path.module}/user-data/frontend.sh", {
    github_repo         = var.github_repo_frontend
    aws_region          = var.aws_region
    log_group_name      = var.frontend_log_group_name
    internal_lb_dns     = var.internal_lb_dns
    environment         = var.environment
  }))

  backend_user_data = base64encode(templatefile("${path.module}/user-data/backend.sh", {
    github_repo         = var.github_repo_backend
    aws_region          = var.aws_region
    log_group_name      = var.backend_log_group_name
    dynamodb_table_name = var.dynamodb_table_name
    environment         = var.environment
    domain_name         = var.domain_name
  }))
}

###############################################################################
# Launch Template – Frontend
###############################################################################
resource "aws_launch_template" "frontend" {
  name_prefix   = "${var.environment}-frontend-lt-"
  update_default_version = true
  image_id      = var.frontend_ami
  instance_type = var.frontend_instance_type
  key_name      = var.key_name

  iam_instance_profile { arn = aws_iam_instance_profile.ec2.arn }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [var.frontend_sg_id]
    delete_on_termination       = true
  }

  user_data = local.frontend_user_data

  metadata_options {
    http_tokens                 = "required"   # IMDSv2 enforced
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.environment}-frontend"
      Tier        = "frontend"
      Environment = var.environment
    }
  }

  lifecycle { create_before_destroy = true }
}

###############################################################################
# Launch Template – Backend
###############################################################################
resource "aws_launch_template" "backend" {
  name_prefix   = "${var.environment}-backend-lt-"
  update_default_version = true
  image_id      = var.backend_ami
  instance_type = var.backend_instance_type
  key_name      = var.key_name

  iam_instance_profile { arn = aws_iam_instance_profile.ec2.arn }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [var.backend_sg_id]
    delete_on_termination       = true
  }

  user_data = local.backend_user_data

  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  monitoring { enabled = true }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 30
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name        = "${var.environment}-backend"
      Tier        = "backend"
      Environment = var.environment
    }
  }

  lifecycle { create_before_destroy = true }
}

###############################################################################
# Auto Scaling Group – Frontend
###############################################################################
resource "aws_autoscaling_group" "frontend" {
  name                      = "${var.environment}-frontend-asg"
  min_size                  = 2
  max_size                  = 6
  desired_capacity          = 2
  vpc_zone_identifier       = var.frontend_subnet_ids  # private-frontend subnets (10.0.10/24, 10.0.11/24, 10.0.12/24)
  target_group_arns         = [var.frontend_tg_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300
  default_cooldown          = 180
  termination_policies      = ["OldestLaunchTemplate", "OldestInstance"]

  launch_template {
    id      = aws_launch_template.frontend.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-frontend"
    propagate_at_launch = true
  }

  tag {
    key                 = "Environment"
    value               = var.environment
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

###############################################################################
# Auto Scaling Group – Backend
###############################################################################
resource "aws_autoscaling_group" "backend" {
  name                      = "${var.environment}-backend-asg"
  min_size                  = 2
  max_size                  = 8
  desired_capacity          = 2
  vpc_zone_identifier       = var.backend_subnet_ids   # private-backend subnets (10.0.20/24, 10.0.21/24, 10.0.22/24)
  target_group_arns         = [var.backend_tg_arn]
  health_check_type         = "ELB"
  health_check_grace_period = 300
  default_cooldown          = 180
  termination_policies      = ["OldestLaunchTemplate", "OldestInstance"]

  launch_template {
    id      = aws_launch_template.backend.id
    version = "$Latest"
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
    }
  }

  tag {
    key                 = "Name"
    value               = "${var.environment}-backend"
    propagate_at_launch = true
  }

  lifecycle { create_before_destroy = true }
}

###############################################################################
# ASG Scaling Policies – Frontend (CPU target tracking)
###############################################################################
resource "aws_autoscaling_policy" "frontend_cpu" {
  name                   = "${var.environment}-frontend-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60.0
  }
}

###############################################################################
# NOTE: ALBRequestCountPerTarget policy removed from initial deploy.
#
# Error cause: "The load balancer does not route traffic to the target group"
# AWS validates the ALB -> TG association when PutScalingPolicy is called.
# In the SAME terraform apply, the HTTPS listener propagation is not
# guaranteed complete before the ASG policy API call fires — causing a 400
# ValidationError even though the resource_label format is correct.
# This is a known AWS cross-module timing issue.
#
# CPU target tracking (frontend_cpu above at 60%) already covers all
# scale-out scenarios. ALBRequestCountPerTarget is an additional policy.
#
# TO ADD THIS AFTER INITIAL DEPLOY (2-step):
#   Step 1: terraform apply   (runs now — deploys everything without this policy)
#   Step 2: Uncomment block below, then run: terraform apply  (adds only this)
#
# resource "aws_autoscaling_policy" "frontend_request_count" {
#   name                   = "${var.environment}-frontend-request-count-scaling"
#   autoscaling_group_name = aws_autoscaling_group.frontend.name
#   policy_type            = "TargetTrackingScaling"
#   target_tracking_configuration {
#     predefined_metric_specification {
#       predefined_metric_type = "ALBRequestCountPerTarget"
#       resource_label         = "${join("/", slice(split("/", var.external_alb_arn), 1, 4))}/targetgroup/${join("/", slice(split("/", var.frontend_tg_arn), 1, 3))}"
#     }
#     target_value = 1000.0
#   }
# }
###############################################################################


###############################################################################
# ASG Scaling Policies – Backend
###############################################################################
resource "aws_autoscaling_policy" "backend_cpu" {
  name                   = "${var.environment}-backend-cpu-scaling"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  policy_type            = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

###############################################################################
# Lifecycle Hooks – Frontend (graceful scale-in)
###############################################################################
resource "aws_autoscaling_lifecycle_hook" "frontend_scale_in" {
  name                   = "${var.environment}-frontend-scale-in-hook"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
  default_result         = "CONTINUE"
  heartbeat_timeout      = 300   # 5 min to drain connections
}

resource "aws_autoscaling_lifecycle_hook" "frontend_scale_out" {
  name                   = "${var.environment}-frontend-scale-out-hook"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_LAUNCHING"
  default_result         = "CONTINUE"
  heartbeat_timeout      = 300   # 5 min for app startup
}

###############################################################################
# Lifecycle Hooks – Backend (graceful drain)
###############################################################################
resource "aws_autoscaling_lifecycle_hook" "backend_scale_in" {
  name                   = "${var.environment}-backend-scale-in-hook"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_TERMINATING"
  default_result         = "CONTINUE"
  heartbeat_timeout      = 600   # 10 min – backend may have long-running jobs
}

resource "aws_autoscaling_lifecycle_hook" "backend_scale_out" {
  name                   = "${var.environment}-backend-scale-out-hook"
  autoscaling_group_name = aws_autoscaling_group.backend.name
  lifecycle_transition   = "autoscaling:EC2_INSTANCE_LAUNCHING"
  default_result         = "CONTINUE"
  heartbeat_timeout      = 300
}

###############################################################################
# Scheduled Scaling – Frontend
# Business hours scale-up: Mon–Fri 08:00 UTC (IST 13:30)
# Night scale-down:        Mon–Fri 20:00 UTC (IST 01:30)
###############################################################################
resource "aws_autoscaling_schedule" "frontend_scale_up" {
  scheduled_action_name  = "${var.environment}-frontend-morning-scaleup"
  min_size               = 3
  max_size               = 6
  desired_capacity       = 3
  recurrence             = "0 8 * * MON-FRI"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
}

resource "aws_autoscaling_schedule" "frontend_scale_down" {
  scheduled_action_name  = "${var.environment}-frontend-night-scaledown"
  min_size               = 2
  max_size               = 6
  desired_capacity       = 2
  recurrence             = "0 20 * * MON-FRI"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
}

resource "aws_autoscaling_schedule" "frontend_weekend_down" {
  scheduled_action_name  = "${var.environment}-frontend-weekend-min"
  min_size               = 1
  max_size               = 4
  desired_capacity       = 1
  recurrence             = "0 20 * * FRI"
  autoscaling_group_name = aws_autoscaling_group.frontend.name
}

###############################################################################
# Scheduled Scaling – Backend
###############################################################################
resource "aws_autoscaling_schedule" "backend_scale_up" {
  scheduled_action_name  = "${var.environment}-backend-morning-scaleup"
  min_size               = 3
  max_size               = 8
  desired_capacity       = 3
  recurrence             = "0 8 * * MON-FRI"
  autoscaling_group_name = aws_autoscaling_group.backend.name
}

resource "aws_autoscaling_schedule" "backend_scale_down" {
  scheduled_action_name  = "${var.environment}-backend-night-scaledown"
  min_size               = 2
  max_size               = 8
  desired_capacity       = 2
  recurrence             = "0 20 * * MON-FRI"
  autoscaling_group_name = aws_autoscaling_group.backend.name
}
