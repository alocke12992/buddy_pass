# Bootstrap stack — applied ONCE with local state (see plans/INFRA.md §2).
# Owns the Terraform state bucket for infra/prod/ and the account-level AWS Budget.
# Local .tfstate here is gitignored; if lost, both resources are trivially re-importable:
#   terraform import aws_s3_bucket.tfstate buddypass-prod-tfstate-712934828837
#   terraform import aws_budgets_budget.monthly 712934828837:buddypass-monthly

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project   = "buddy-pass"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "buddypass-prod-tfstate-${var.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = "alias/aws/s3"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# $50 actual / $60 forecast (= 120% of the $50 limit), email alerts (INFRA.md §1 Alerting)
resource "aws_budgets_budget" "monthly" {
  name         = "buddypass-monthly"
  budget_type  = "COST"
  limit_amount = "50"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "FORECASTED"
    threshold                  = 120
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }
}

output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}
