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

variable "alert_email" {
  type    = string
  default = "alocke12992+buddypass@gmail.com"
}
