# CI IAM user — the ONLY standing credential in the system (INFRA.md §1).
# Scope: push to the two ECR repos + trigger deploy.sh over SSM. Nothing else.
# The access key is deliberately NOT managed by Terraform (would persist in state);
# mint it once with `aws iam create-access-key` and store in GH Actions secrets.
# Rotation is a manual calendar chore.
#
# The EC2 instance role lands here in milestone 4.

resource "aws_iam_user" "ci" {
  name = "${var.name_prefix}-ci"
}

data "aws_iam_policy_document" "ci" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }

  # Instance doesn't exist until milestone 4 — scope by Project tag so this
  # policy doesn't need touching then. Only AWS-RunShellScript is allowed.
  statement {
    sid       = "SsmSendToTaggedInstances"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.region}:${var.account_id}:instance/*"]

    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = ["buddy-pass"]
    }
  }

  statement {
    sid       = "SsmSendRunShellScript"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "SsmPollResult"
    actions   = ["ssm:GetCommandInvocation"]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "ci" {
  name   = "${var.name_prefix}-ci"
  user   = aws_iam_user.ci.name
  policy = data.aws_iam_policy_document.ci.json
}

output "ci_user_name" {
  value = aws_iam_user.ci.name
}
