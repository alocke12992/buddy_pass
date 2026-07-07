# Runtime config/secrets (INFRA.md §3a). deploy.sh renders ALL params under
# /${var.name_prefix}/env/ into /opt/buddy-pass/.env — add a param here, redeploy,
# and it's live. Secrets are Terraform-minted (random_password) and exist only in
# SSM + encrypted state; never in outputs, images, or GH secrets.

resource "random_password" "better_auth_secret" {
  length  = 48
  special = false
}

locals {
  env_params = {
    # sslmode=require: RDS forces TLS; the cert verifies against the RDS CA
    # bundle user_data fetches (mounted + NODE_EXTRA_CA_CERTS in compose)
    DATABASE_URL = {
      value  = "postgres://${aws_db_instance.main.username}:${random_password.rds_master.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}?sslmode=require"
      secure = true
    }
    BETTER_AUTH_SECRET = {
      value  = random_password.better_auth_secret.result
      secure = true
    }
    BETTER_AUTH_URL = { value = "https://${var.domain_name}", secure = false }
    APP_ORIGIN      = { value = "https://${var.domain_name}", secure = false }
    CORS_ORIGIN     = { value = "https://${var.domain_name}", secure = false }
    SITE_ADDRESS    = { value = var.domain_name, secure = false }
    IMAGE_BASE_URL = {
      value  = "https://${aws_s3_bucket.assets.bucket}.s3.${var.region}.amazonaws.com/exercises"
      secure = false
    }
  }
}

resource "aws_ssm_parameter" "env" {
  for_each = local.env_params

  name  = "/${var.name_prefix}/env/${each.key}"
  type  = each.value.secure ? "SecureString" : "String"
  value = each.value.value
}
