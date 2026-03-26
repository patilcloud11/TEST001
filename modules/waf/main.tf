###############################################################################
# Module: WAF v2
# Attached to external ALB.
# Rules (evaluated in priority order):
#   1.  IP block list (custom)
#   2.  Rate limiting        – 2000 req / 5 min per IP
#   3.  AWS Managed – Common Rule Set (SQLi, XSS, etc.)
#   4.  AWS Managed – Known Bad Inputs
#   5.  AWS Managed – SQL Injection
#   6.  AWS Managed – Linux OS
#   7.  AWS Managed – Anonymous IP List (Tor / proxies)
###############################################################################

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.environment}-family-finance-waf"
  description = "WAF for Family Finance AI application"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  ###########################################################################
  # Rule 1 – IP Block List
  ###########################################################################
  rule {
    name     = "IPBlockList"
    priority = 1

    action {
      block {}
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.blocked_ips.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-IPBlockList"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 2 – Rate Limiting
  ###########################################################################
  rule {
    name     = "RateLimiting"
    priority = 2

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-RateLimiting"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 3 – AWS Managed Common Rule Set
  ###########################################################################
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"

        # Allow large financial document uploads
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            allow {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-CommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 4 – Known Bad Inputs
  ###########################################################################
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 5 – SQL Injection
  ###########################################################################
  rule {
    name     = "AWSManagedRulesSQLiRuleSet"
    priority = 5

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-SQLiRuleSet"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 6 – Linux OS Rules
  ###########################################################################
  rule {
    name     = "AWSManagedRulesLinuxRuleSet"
    priority = 6

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesLinuxRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-LinuxRuleSet"
      sampled_requests_enabled   = true
    }
  }

  ###########################################################################
  # Rule 7 – Anonymous IP List (count-only; switch override_action to
  #          none {} after reviewing sampled requests)
  ###########################################################################
  rule {
    name     = "AWSManagedRulesAnonymousIpList"
    priority = 7

    override_action {
      count {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAnonymousIpList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}-AnonymousIPList"
      sampled_requests_enabled   = true
    }
  }

  tags = {
    Name = "${var.environment}-waf-acl"
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.environment}-WebACL"
    sampled_requests_enabled   = true
  }
}

###############################################################################
# IP Set – blocked IPs (populate manually or via automation)
###############################################################################
resource "aws_wafv2_ip_set" "blocked_ips" {
  name               = "${var.environment}-blocked-ips"
  description        = "Manually blocked IP addresses"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = []   # Add CIDRs here: ["1.2.3.4/32"]

  tags = {
    Name = "${var.environment}-blocked-ips"
  }
}

###############################################################################
# WAF Logging to CloudWatch
###############################################################################
resource "aws_cloudwatch_log_group" "waf" {
  # WAF log group MUST start with "aws-waf-logs-"
  name              = "aws-waf-logs-${var.environment}-family-finance"
  retention_in_days = 30
  tags = {
    Name = "${var.environment}-waf-logs"
  }
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.main.arn

  logging_filter {
    default_behavior = "KEEP"

    filter {
      behavior = "KEEP"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      requirement = "MEETS_ANY"
    }

    filter {
      behavior = "DROP"
      condition {
        action_condition {
          action = "ALLOW"
        }
      }
      requirement = "MEETS_ANY"
    }
  }
}

###############################################################################
# CloudWatch Alarm – WAF blocked requests spike
###############################################################################
resource "aws_cloudwatch_metric_alarm" "waf_blocked_requests" {
  alarm_name          = "${var.environment}-waf-blocked-requests"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "BlockedRequests"
  namespace           = "AWS/WAFV2"
  period              = 300
  statistic           = "Sum"
  threshold           = 100
  alarm_description   = "High number of WAF blocked requests — potential attack"
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL = aws_wafv2_web_acl.main.name
    Region = "us-east-1"
    Rule   = "ALL"
  }

  tags = {
    Name = "${var.environment}-waf-blocked-alarm"
  }
}
