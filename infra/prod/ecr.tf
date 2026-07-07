# ECR repos for the two deployables (INFRA.md §2). Tags are mutable because every
# deploy pushes <git-sha> + latest; lifecycle keeps the last 10 so rollback targets
# survive but storage stays bounded.

locals {
  ecr_repos = ["api", "web"]
}

resource "aws_ecr_repository" "app" {
  for_each = toset(local.ecr_repos)

  name = "${var.name_prefix}/${each.key}"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "keep_last_10" {
  for_each = aws_ecr_repository.app

  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

output "ecr_repository_urls" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}
