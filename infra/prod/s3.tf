# Assets bucket (INFRA.md §2): private by default; only exercises/* is publicly
# readable (exercise library images, synced in milestone 6). IMAGE_BASE_URL will
# point here until/unless CloudFront lands.

resource "aws_s3_bucket" "assets" {
  bucket = "${var.name_prefix}-assets-${var.account_id}"
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  # ACLs stay fully blocked; public reads are granted ONLY via the scoped
  # bucket policy below, so block_public_policy must be off.
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

data "aws_iam_policy_document" "assets_public_read" {
  statement {
    sid       = "PublicReadExerciseImages"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/exercises/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = data.aws_iam_policy_document.assets_public_read.json

  depends_on = [aws_s3_bucket_public_access_block.assets]
}

output "assets_bucket" {
  value = aws_s3_bucket.assets.bucket
}
