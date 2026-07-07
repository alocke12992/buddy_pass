# DNS + uptime alerting (INFRA.md §1). The hosted zone was auto-created when
# buddy-pass.com was registered via Route53 — adopt it (data source), never create
# a second zone (its NS records wouldn't match the registration).
#
# Route53 health checks publish CloudWatch metrics ONLY to us-east-1, so the alarm
# and its SNS topic live there (aliased provider in main.tf).

data "aws_route53_zone" "main" {
  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_health_check" "app" {
  fqdn              = var.domain_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  request_interval  = 30
  failure_threshold = 3

  tags = { Name = "${var.name_prefix}-health" }
}

resource "aws_sns_topic" "alerts_use1" {
  provider = aws.use1
  name     = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  provider  = aws.use1
  topic_arn = aws_sns_topic.alerts_use1.arn
  protocol  = "email"
  endpoint  = var.alert_email # requires one manual confirmation click
}

resource "aws_cloudwatch_metric_alarm" "health" {
  provider = aws.use1

  alarm_name          = "${var.name_prefix}-health"
  alarm_description   = "https://${var.domain_name}/health failing"
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  statistic           = "Minimum"
  comparison_operator = "LessThanThreshold"
  threshold           = 1
  period              = 60
  evaluation_periods  = 3

  dimensions = {
    HealthCheckId = aws_route53_health_check.app.id
  }

  alarm_actions = [aws_sns_topic.alerts_use1.arn]
  ok_actions    = [aws_sns_topic.alerts_use1.arn]
}
