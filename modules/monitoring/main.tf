###############################################################################
# Module: Monitoring
#
# Stack:
#   CloudWatch Log Groups (frontend + backend)
#   → Metric Filters (errors, 5xx, latency, DynamoDB errors)
#   → CloudWatch Alarms (per metric)
#   → SNS Topic
#   → Lambda (Slack notifier)
#
# DynamoDB Streams logs handled in the dynamodb module.
###############################################################################

###############################################################################
# CloudWatch Log Groups
###############################################################################
resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/app/${var.environment}/frontend"
  retention_in_days = 30
  tags              = { Name = "${var.environment}-frontend-logs" }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/app/${var.environment}/backend"
  retention_in_days = 60
  tags              = { Name = "${var.environment}-backend-logs" }
}

resource "aws_cloudwatch_log_group" "lambda_slack" {
  name              = "/aws/lambda/${var.environment}-slack-notifier"
  retention_in_days = 14
  tags              = { Name = "${var.environment}-lambda-slack-logs" }
}

###############################################################################
# SNS Topic + Subscription (Lambda)
###############################################################################
resource "aws_sns_topic" "alerts" {
  name              = "${var.environment}-family-finance-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = { Name = "${var.environment}-alerts-topic" }
}

###############################################################################
# IAM Role for Slack Notifier Lambda
###############################################################################
resource "aws_iam_role" "slack_lambda" {
  name = "${var.environment}-slack-notifier-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.slack_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "slack_lambda_custom" {
  name = "${var.environment}-slack-lambda-policy"
  role = aws_iam_role.slack_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/aws/lambda/*"
    }]
  })
}

###############################################################################
# Lambda – Slack Notifier
###############################################################################
data "archive_file" "slack_notifier" {
  type        = "zip"
  output_path = "${path.module}/lambda/slack_notifier.zip"
  source_file = "${path.module}/lambda/slack_notifier.py"
}

resource "aws_lambda_function" "slack_notifier" {
  function_name    = "${var.environment}-slack-notifier"
  role             = aws_iam_role.slack_lambda.arn
  handler          = "slack_notifier.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.slack_notifier.output_path
  source_code_hash = data.archive_file.slack_notifier.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      ENVIRONMENT       = var.environment
      AWS_REGION_NAME   = var.aws_region
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda_slack]
  tags       = { Name = "${var.environment}-slack-notifier" }
}

# Allow SNS to invoke Lambda
resource "aws_lambda_permission" "sns_invoke" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

# Subscribe Lambda to SNS
resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}

###############################################################################
# CloudWatch Metric Filters – Backend Log Group
###############################################################################

# Filter 1: Application Errors (ERROR level logs)
resource "aws_cloudwatch_log_metric_filter" "backend_errors" {
  name           = "${var.environment}-backend-error-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "[timestamp, level=\"ERROR\", ...]"

  metric_transformation {
    name          = "BackendErrorCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Filter 2: HTTP 5xx responses
resource "aws_cloudwatch_log_metric_filter" "backend_5xx" {
  name           = "${var.environment}-backend-5xx-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "[timestamp, level, method, path, status_code=5*, ...]"

  metric_transformation {
    name          = "Backend5xxCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Filter 3: HTTP 4xx responses
resource "aws_cloudwatch_log_metric_filter" "backend_4xx" {
  name           = "${var.environment}-backend-4xx-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "[timestamp, level, method, path, status_code=4*, ...]"

  metric_transformation {
    name          = "Backend4xxCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Filter 4: Slow requests (latency > 2000ms in logs)
resource "aws_cloudwatch_log_metric_filter" "backend_slow_requests" {
  name           = "${var.environment}-backend-slow-requests"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "[timestamp, level, method, path, status_code, duration > 2000, ...]"

  metric_transformation {
    name          = "BackendSlowRequests"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Filter 5: DynamoDB errors in backend logs
resource "aws_cloudwatch_log_metric_filter" "dynamodb_errors" {
  name           = "${var.environment}-dynamodb-error-count"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?\"DynamoDB error\" ?\"ResourceNotFoundException\" ?\"ProvisionedThroughputExceededException\""

  metric_transformation {
    name          = "DynamoDBErrorCount"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

# Filter 6: Uncaught exceptions / crashes
resource "aws_cloudwatch_log_metric_filter" "backend_uncaught" {
  name           = "${var.environment}-backend-uncaught-exceptions"
  log_group_name = aws_cloudwatch_log_group.backend.name
  pattern        = "?UnhandledPromiseRejection ?\"uncaughtException\" ?\"FATAL\""

  metric_transformation {
    name          = "BackendUncaughtExceptions"
    namespace     = "FamilyFinance/Backend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

###############################################################################
# CloudWatch Metric Filters – Frontend Log Group
###############################################################################
resource "aws_cloudwatch_log_metric_filter" "frontend_errors" {
  name           = "${var.environment}-frontend-error-count"
  log_group_name = aws_cloudwatch_log_group.frontend.name
  pattern        = "[timestamp, level=\"ERROR\", ...]"

  metric_transformation {
    name          = "FrontendErrorCount"
    namespace     = "FamilyFinance/Frontend"
    value         = "1"
    default_value = "0"
    unit          = "Count"
  }
}

###############################################################################
# CloudWatch Alarms → SNS
###############################################################################

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
}

# --- Backend Error Rate ---
resource "aws_cloudwatch_metric_alarm" "backend_error_rate" {
  alarm_name          = "${var.environment}-backend-high-error-rate"
  alarm_description   = "Backend application error rate is elevated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BackendErrorCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-error-rate" }
}

# --- Backend 5xx Alarm ---
resource "aws_cloudwatch_metric_alarm" "backend_5xx" {
  alarm_name          = "${var.environment}-backend-5xx-high"
  alarm_description   = "Backend HTTP 5xx responses exceeded threshold — possible service failure"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Backend5xxCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 20
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-5xx" }
}

# --- Slow Requests ---
resource "aws_cloudwatch_metric_alarm" "backend_slow_requests" {
  alarm_name          = "${var.environment}-backend-slow-requests"
  alarm_description   = "High number of slow requests (>2s) — possible performance degradation"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "BackendSlowRequests"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-slow-requests" }
}

# --- DynamoDB Errors ---
resource "aws_cloudwatch_metric_alarm" "dynamodb_errors_backend" {
  alarm_name          = "${var.environment}-dynamodb-errors-backend"
  alarm_description   = "Backend reporting DynamoDB errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DynamoDBErrorCount"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-dynamodb-errors-backend" }
}

# --- Uncaught Exceptions ---
resource "aws_cloudwatch_metric_alarm" "backend_uncaught" {
  alarm_name          = "${var.environment}-backend-uncaught-exceptions"
  alarm_description   = "Backend uncaught exceptions detected — critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BackendUncaughtExceptions"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-uncaught-exceptions" }
}

# --- ALB 5xx Target Errors (from AWS/ApplicationELB namespace) ---
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.environment}-alb-5xx-errors"
  alarm_description   = "ALB reporting high 5xx target errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-alb-5xx" }
}

# --- ALB Response Time ---
resource "aws_cloudwatch_metric_alarm" "alb_target_response_time" {
  alarm_name          = "${var.environment}-alb-high-latency"
  alarm_description   = "ALB target response time exceeded 3 seconds"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Average"
  threshold           = 3
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-alb-latency" }
}

# --- Frontend Error Rate ---
resource "aws_cloudwatch_metric_alarm" "frontend_errors" {
  alarm_name          = "${var.environment}-frontend-high-error-rate"
  alarm_description   = "Frontend application errors are elevated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FrontendErrorCount"
  namespace           = "FamilyFinance/Frontend"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-frontend-errors" }
}

# --- Backend CPU (from CloudWatch Agent custom metrics) ---
resource "aws_cloudwatch_metric_alarm" "backend_cpu" {
  alarm_name          = "${var.environment}-backend-high-cpu"
  alarm_description   = "Backend instances CPU usage above 85%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "cpu_usage_user"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-cpu" }
}

# --- Backend Memory ---
resource "aws_cloudwatch_metric_alarm" "backend_memory" {
  alarm_name          = "${var.environment}-backend-high-memory"
  alarm_description   = "Backend instances memory usage above 85%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "mem_used_percent"
  namespace           = "FamilyFinance/Backend"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = { Name = "${var.environment}-backend-memory" }
}

###############################################################################
# CloudWatch Dashboard
###############################################################################
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.environment}-family-finance"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y = 0
        width = 12
        height = 6
        properties = {
          title  = "Backend Error Rates"
          period = 300
          metrics = [
            ["FamilyFinance/Backend", "BackendErrorCount"],
            ["FamilyFinance/Backend", "Backend5xxCount"],
            ["FamilyFinance/Backend", "BackendUncaughtExceptions"]
          ]
          view  = "timeSeries"
          stat  = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y = 0
        width = 12
        height = 6
        properties = {
          title  = "ALB Latency & 5xx"
          period = 300
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", {stat = "Average"}],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", {stat = "Sum"}]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 0
        y = 6
        width = 12
        height = 6
        properties = {
          title  = "Backend CPU & Memory"
          period = 300
          metrics = [
            ["FamilyFinance/Backend", "cpu_usage_user", {stat = "Average"}],
            ["FamilyFinance/Backend", "mem_used_percent", {stat = "Average"}]
          ]
          view   = "timeSeries"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y = 6
        width = 12
        height = 6
        properties = {
          title  = "DynamoDB Errors & Throttles"
          period = 300
          metrics = [
            ["AWS/DynamoDB", "SystemErrors", "TableName", var.dynamodb_table_name],
            ["AWS/DynamoDB", "ThrottledRequests", "TableName", var.dynamodb_table_name]
          ]
          view   = "timeSeries"
          stat   = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "alarm"
        x      = 0
        y = 12
        width = 24
        height = 6
        properties = {
          title  = "All Alarms Status"
          alarms = [
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-high-error-rate",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-5xx-high",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-backend-uncaught-exceptions",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-alb-5xx-errors",
            "arn:aws:cloudwatch:${var.aws_region}:${var.account_id}:alarm:${var.environment}-dynamodb-errors-backend"
          ]
        }
      }
    ]
  })
}
