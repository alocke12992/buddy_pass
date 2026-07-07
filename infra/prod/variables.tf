# Prod-only for now, but written variable-friendly so a future infra/staging/
# can reuse the same shapes (INFRA.md §1 Environments). No premature modules.

variable "account_id" {
  description = "Dedicated buddy-pass AWS account — safety pin so applies can never land elsewhere"
  type        = string
  default     = "712934828837"
}

variable "region" {
  type    = string
  default = "us-west-2"
}

variable "aws_profile" {
  description = "Local AWS SSO profile used for laptop-only applies"
  type        = string
  default     = "buddypass_prod"
}

variable "name_prefix" {
  description = "Prefix for all resource names/tags"
  type        = string
  default     = "buddypass-prod"
}

variable "domain_name" {
  description = "The single source of truth for the public domain (INFRA.md §1 Domain/TLS) — flows into Route53, SITE_ADDRESS, CORS origins, IMAGE_BASE_URL, smoke tests"
  type        = string
  default     = "buddy-pass.com"
}

variable "alert_email" {
  description = "Budget + health-check SNS subscriber"
  type        = string
  default     = "alocke12992+buddypass@gmail.com"
}
