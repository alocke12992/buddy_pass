# RDS Postgres 17 — posture per INFRA.md §2a. Master password is Terraform-minted
# (random_password) and consumed via the DATABASE_URL SSM parameter (ssm.tf,
# milestone 4); it exists only in SSM + encrypted state, never in outputs.

resource "random_password" "rds_master" {
  length  = 32
  special = false # keeps DATABASE_URL free of URL-encoding surprises
}

resource "aws_db_subnet_group" "main" {
  name       = var.name_prefix
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "main" {
  identifier = var.name_prefix

  engine         = "postgres"
  engine_version = "17"
  instance_class = "db.t4g.micro"

  db_name  = "buddy_pass"
  username = "buddy"
  password = random_password.rds_master.result

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period    = 7
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${var.name_prefix}-final"
  auto_minor_version_upgrade = true
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}
