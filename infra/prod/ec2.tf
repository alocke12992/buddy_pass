# The app host (INFRA.md §2/§3): t4g.small AL2023 arm64, public subnet + EIP,
# docker compose runtime laid down by user_data. Stateless cattle — recovery or
# host-level change = taint + re-apply + one deploy.

data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

locals {
  compose_file = templatefile("${path.module}/templates/docker-compose.prod.yml", {
    ecr_registry = "${var.account_id}.dkr.ecr.${var.region}.amazonaws.com"
    name_prefix  = var.name_prefix
  })
  deploy_script = templatefile("${path.module}/templates/deploy.sh", {
    ecr_registry = "${var.account_id}.dkr.ecr.${var.region}.amazonaws.com"
    name_prefix  = var.name_prefix
    region       = var.region
  })
}

resource "aws_iam_role" "instance" {
  name = "${var.name_prefix}-instance"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# SSM agent (Run Command + Session Manager — our only shell access)
resource "aws_iam_role_policy_attachment" "instance_ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "instance" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }

  statement {
    sid       = "ReadEnvParams"
    actions   = ["ssm:GetParametersByPath", "ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:parameter/${var.name_prefix}/env*"]
  }

  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "AssetsRead"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
  }
}

resource "aws_iam_role_policy" "instance" {
  name   = "${var.name_prefix}-instance"
  role   = aws_iam_role.instance.name
  policy = data.aws_iam_policy_document.instance.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${var.name_prefix}-instance"
  role = aws_iam_role.instance.name
}

resource "aws_instance" "app" {
  ami           = data.aws_ssm_parameter.al2023_arm64.insecure_value
  instance_type = "t4g.small"

  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  user_data = templatefile("${path.module}/templates/user_data.sh", {
    compose_file    = local.compose_file
    deploy_script   = local.deploy_script
    compose_version = "v5.2.0" # pinned; >7 days old per dependency policy
  })
  user_data_replace_on_change = true # cattle: host config change = new box

  root_block_device {
    volume_type = "gp3"
    volume_size = 30 # image accumulation headroom; prune rides deploy.sh
  }

  metadata_options {
    http_tokens = "required" # IMDSv2 only
  }

  lifecycle {
    ignore_changes = [ami] # AMI updates shouldn't force replacement on every apply
  }

  tags = { Name = "${var.name_prefix}-app" }
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${var.name_prefix}-app" }
}

output "instance_id" {
  value = aws_instance.app.id
}

output "eip" {
  value = aws_eip.app.public_ip
}
