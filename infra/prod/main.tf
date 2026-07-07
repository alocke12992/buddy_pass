# Production stack — plan of record: plans/INFRA.md.
# State lives in the bucket created by infra/bootstrap/ (native S3 locking, TF >= 1.10).
# Applies are laptop-only via the buddypass_prod SSO profile; CI never applies.

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "buddypass-prod-tfstate-712934828837"
    key          = "prod/terraform.tfstate"
    region       = "us-west-2"
    profile      = "buddypass_prod"
    use_lockfile = true
    encrypt      = true
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
      Stack     = "prod"
    }
  }
}

# Route53 health-check metrics/alarms only exist in us-east-1 (see dns.tf)
provider "aws" {
  alias               = "use1"
  region              = "us-east-1"
  profile             = var.aws_profile
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Project   = "buddy-pass"
      ManagedBy = "terraform"
      Stack     = "prod"
    }
  }
}
