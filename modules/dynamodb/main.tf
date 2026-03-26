###############################################################################
# Module: DynamoDB
# - Main finance table (single-table design with GSIs)
# - DynamoDB Streams → Lambda → CloudWatch Logs
# - Point-in-time recovery, encryption, TTL
# - CloudWatch alarms for system errors
###############################################################################

###############################################################################
# Main Table – Single Table Design
###############################################################################
resource "aws_dynamodb_table" "main" {
  name         = "${var.environment}-family-finance"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  # GSI-1: userId + date  (list all transactions for a user by date)
  global_secondary_index {
    name            = "GSI1-UserDate"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  # GSI-2: category + date  (spending by category reports)
  global_secondary_index {
    name            = "GSI2-CategoryDate"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Name        = "${var.environment}-family-finance"
    Environment = var.environment
  }
}

###############################################################################
# CloudWatch Log Group – DynamoDB Stream Events (audit trail)
###############################################################################
resource "aws_cloudwatch_log_group" "dynamodb_stream" {
  name              = "/aws/dynamodb/${var.environment}/streams"
  retention_in_days = 90
  tags = {
    Name = "${var.environment}-dynamodb-stream-logs"
  }
}

###############################################################################
# IAM Role – Stream Logger Lambda
###############################################################################
resource "aws_iam_role" "dynamodb_stream_lambda" {
  name = "${var.environment}-dynamodb-stream-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "dynamodb_stream_lambda" {
  name = "${var.environment}-dynamodb-stream-policy"
  role = aws_iam_role.dynamodb_stream_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = [aws_dynamodb_table.main.stream_arn]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

###############################################################################
# Lambda – DynamoDB Stream → CloudWatch Logs
###############################################################################
data "archive_file" "stream_logger" {
  type        = "zip"
  output_path = "${path.module}/lambda/stream_logger.zip"
  source {
    content  = file("${path.module}/lambda/stream_logger.js")
    filename = "index.js"
  }
}

resource "aws_lambda_function" "stream_logger" {
  function_name    = "${var.environment}-dynamodb-stream-logger"
  role             = aws_iam_role.dynamodb_stream_lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.stream_logger.output_path
  source_code_hash = data.archive_file.stream_logger.output_base64sha256
  timeout          = 60
  memory_size      = 128

  environment {
    variables = {
      LOG_GROUP_NAME = aws_cloudwatch_log_group.dynamodb_stream.name
    }
  }

  tags = {
    Name = "${var.environment}-dynamodb-stream-logger"
  }
}

resource "aws_lambda_event_source_mapping" "dynamodb_stream" {
  event_source_arn               = aws_dynamodb_table.main.stream_arn
  function_name                  = aws_lambda_function.stream_logger.arn
  starting_position              = "LATEST"
  batch_size                     = 100
  bisect_batch_on_function_error = true
}

###############################################################################
# CloudWatch Alarm – DynamoDB System Errors
###############################################################################
resource "aws_cloudwatch_metric_alarm" "system_errors" {
  alarm_name          = "${var.environment}-dynamodb-system-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "DynamoDB system errors > 5 over 10 min"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.main.name
  }

  tags = {
    Name = "${var.environment}-dynamodb-errors-alarm"
  }
}
