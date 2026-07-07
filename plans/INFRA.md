# Buddy Pass — Infrastructure Plan (Phase 2.5)

> Refined from `MVP.md` §2/§7/§9 on 2026-07-07, then stress-tested via grilling session same day. This is the source of truth for the production infrastructure and deploy pipeline. High-level prod-target decisions (single EC2 + compose + Caddy, RDS, S3, Terraform, ~$30–45/mo) are settled in `MVP.md` §2 and not revisited here.

---

## 0. Concrete values (milestone 0, done 2026-07-07)

| Fact | Value |
| ------| -------|
| AWS account | `712934828837` — dedicated, under an Organization |
| Region | `us-west-2` |
| Human access | IAM Identity Center SSO, local profile `buddypass_prod` (AdministratorAccess) |
| Domain | `buddy-pass.com` — registered via Route53 in this account |
| Alert email | `alocke12992+buddypass@gmail.com` |
| Local toolchain | AWS CLI v2 + Terraform ≥ 1.10 via Homebrew `hashicorp/tap` |

## 1. Decisions

| Decision | Choice | Why |
| ----------| --------| -----|
| Account / region | **Dedicated AWS account**, **us-west-2** | Blast-radius isolation (leaked key, bill surprise, destroy typo stays contained); region pinned in `infra/prod/` variables + GH workflow |
| Human credentials | **IAM Identity Center (SSO)** — `aws configure sso`, short-lived creds | No standing admin key on the laptop; root gets MFA and is never used for daily work |
| IaC tool | **Terraform** in `infra/` | Settled in MVP §2 |
| Terraform state | **S3 backend** created by a tiny `infra/bootstrap/` stack; native S3 locking (TF ≥ 1.10) | No DynamoDB table, no third-party state host |
| Terraform applies | **Laptop-only** (via SSO) for the MVP — CI never gets apply rights | Deploy pipeline only pushes images + pokes SSM; smallest possible CI privilege |
| Environments | **Prod only**, written variable-friendly (sizes/names/tags as variables, consistent `name_prefix`) — no premature modules | Staging is a tax with zero users; `--profile full` compose is the prod-shape rehearsal; door stays open for `infra/staging/` later |
| Deploy transport | **SSM Run Command** | No open port 22, no SSH key management; IAM-only auth; SSM agent ships with AL2023 |
| CI → AWS auth | **IAM user + access keys** in GH Actions secrets | Policy scoped to ECR push (two repos) + `ssm:SendCommand` (one instance, `AWS-RunShellScript`). Manual key rotation is the accepted chore; revisit OIDC if the project grows |
| Migrations | Run **on the EC2 box** as a one-off container inside `deploy.sh`; api image ships a second entrypoint (`node dist/migrate.js`, drizzle-orm programmatic `migrate()` + `migrations/` folder COPYed in) | RDS stays private, never reachable from GitHub; migrations version-locked to the exact image they ship with. *(Amends MVP §7 "run drizzle migrations against RDS" from Actions.)* |
| Rollback | Deploy workflow takes an optional `workflow_dispatch` sha input → redeploy any previous image. Migration policy = **roll forward** (fix + redeploy); RDS PITR is the disaster hatch. No down-migration machinery | Bad-image rollback is a button click; bad-migration rollback machinery isn't worth building at this scale |
| Domain / TLS | **Buy the real domain during Phase 2.5** (Route53). Hosted zone + records Terraform-managed; Caddy ACME TLS from the first real deploy. Domain lives in a single `domain_name` TF variable → `SITE_ADDRESS`, CORS/trusted origins, `IMAGE_BASE_URL`, smoke-test URL | No cleartext-password window, no `useSecureCookies` hack, no risky late-stage flip. Registration itself is a one-time manual act (prerequisite for milestone 4) |
| Instance arch | **linux/arm64** (t4g = Graviton) | Cheapest; CI builds arm64 via GH ARM runners or buildx/QEMU; Apple Silicon laptop is a native-arm64 break-glass build path |
| Runtime secrets | **SSM Parameter Store** SecureStrings, rendered to `.env` by `deploy.sh` (see §3a) | Nothing secret in images, user_data, or GH secrets beyond the CI key |
| Alerting | **AWS Budget** ($50 actual / $60 forecast, email) in milestone 1; **Route53 health check** on `https://<domain>/health` + CloudWatch alarm + SNS email in milestone 4. Nothing heavier (no log shipping/dashboards) | Catches bill surprises in days and outages before a friend with a share link does; `docker logs` over SSM session covers the rest |

---

## 2. Terraform layout

```
infra/
├── bootstrap/     # applied ONCE with local state: S3 state bucket (versioned, encrypted, public-access-blocked) + AWS Budget
└── prod/          # backend = that bucket
    ├── vpc.tf     # VPC, 1 public subnet (EC2), 2 private subnets across AZs (RDS subnet group), no NAT gateway
    ├── ecr.tf     # api + web repos, lifecycle policy (keep last ~10 images)
    ├── rds.tf     # Postgres 17 db.t4g.micro — posture in §2a
    ├── s3.tf      # exercise-images bucket (private bucket; public read policy on exercises/* only)
    ├── ec2.tf     # t4g.small AL2023 arm64, 30 GB gp3 root, Elastic IP; user_data per §3
    ├── dns.tf     # Route53 hosted zone, A record → EIP, health check + CloudWatch alarm + SNS email
    ├── iam.tf     # instance role (ECR pull, S3 read, SSM params read, AmazonSSMManagedInstanceCore) + CI IAM user
    └── ssm.tf     # SecureString params: DATABASE_URL, BETTER_AUTH_SECRET, SITE_ADDRESS, IMAGE_BASE_URL, …
```

Notes:

- No NAT gateway: the EC2 box sits in the public subnet with its own EIP; the private subnets exist only to satisfy the RDS subnet group (2 AZs required). Saves ~$32/mo.
- EC2 security group ingress: 80 + 443 only.
- The EC2 instance is **cattle**: nothing stateful on the box (data = RDS, images = S3, config = SSM). Host-level changes and recovery = `terraform taint` + re-apply + one deploy (~10 min). No config-management tooling; user_data drift after first boot is accepted under this policy.

### 2a. RDS posture

| Knob | Setting | Why |
| ------| ---------| -----|
| `deletion_protection` | on | `terraform destroy`/typo cannot take the DB |
| Final snapshot on delete | required (no `skip_final_snapshot`) | Same protection class |
| Backup retention | 7 days | Free at this size; PITR covers late-noticed bad migrations |
| Multi-AZ | off | Doubles DB cost; an hour of downtime is acceptable pre-users |
| Storage | 20 GB gp3, autoscaling cap 50 GB | Floor is plenty; autoscaling prevents disk-full, cap prevents bill surprise |
| Public accessibility | off | Private subnets, SG ingress only from the EC2 SG |
| Minor engine upgrades | auto, in a maintenance window | Zero-touch patching |

---

## 3. Runtime shape on the box

`user_data` (cloud-init, first boot only) installs docker + compose plugin, writes `/etc/docker/daemon.json` (json-file log rotation: `max-size: 10m`, `max-file: 3`), enables `dnf-automatic` for OS security patches, and lays down `/opt/buddy-pass/`:

- **`docker-compose.prod.yml`** — `api` + `web` (Caddy) services only, **no postgres service** (unlike local compose). Images pinned by tag interpolated from `.env` (`IMAGE_TAG`). `web` publishes `:80` + `:443`; Caddy env: `SITE_ADDRESS` (the real domain → ACME TLS), `API_UPSTREAM` (already parameterized in `apps/web/Caddyfile`).
- **`deploy.sh <image-tag>`** — the single deploy entrypoint, run manually or via SSM:
  1. ECR login (instance role)
  2. Render `.env` from SSM Parameter Store (`aws ssm get-parameters-by-path --with-decryption`)
  3. `docker compose pull`
  4. Run drizzle migrations: `docker compose run --rm api node dist/migrate.js` (journal-aware; re-runs are no-ops)
  5. `docker compose up -d`
  6. `curl -f localhost/health` retry loop; non-zero exit on failure so SSM reports the deploy as failed
  7. `docker image prune -af --filter "until=168h"` — cleanup rides the deploy; recent images stay for instant rollback

### 3a. Secrets lifecycle

- **Minting**: Terraform generates the RDS password and `BETTER_AUTH_SECRET` via `random_password` and writes them straight to SSM SecureStrings. They exist only in SSM + Terraform state (which is why the state bucket is encrypted, versioned, and private). No hand-pasted secrets that a rebuild would forget.
- **Update path**: `.env` renders only during `deploy.sh`, so a changed SSM param is inert until the next deploy. Contract: *change param → run the `workflow_dispatch` deploy at the current sha*. The rollback button doubles as the config-refresh button. No hot-reload machinery.
- **Caveat, accepted**: rotating `BETTER_AUTH_SECRET` invalidates all sessions (everyone re-logs-in).

---

## 4. Deploy pipeline (`.github/workflows/deploy.yml`)

Triggers: push to `main` (gated on the existing CI checks passing — `workflow_run` on CI success, or a single workflow with a `needs:` chain) **and** `workflow_dispatch` with an optional `sha` input (rollback / redeploy / config refresh). A `concurrency` group (queue, don't cancel) serializes deploys so racing merges can't interleave SSM commands.

1. Build `api` + `web` images for **linux/arm64** — GH ARM runners (`ubuntu-24.04-arm`) if available to the repo, else buildx + QEMU
2. Tag `<git-sha>` + `latest`, push to ECR
3. `aws ssm send-command` → `deploy.sh <git-sha>` on the instance
4. Poll `aws ssm get-command-invocation` until success/failure
5. Smoke test from the runner: `curl -f https://<domain>/health`

Secrets in GH Actions: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` only; region, instance id, ECR registry, and domain as repo variables.

---

## 5. Milestones (each independently verifiable)

| # | Deliverable | Verified by |
| ---| -------------| -------------|
| 0 ✅ | Account prep (manual, one-time): dedicated account, root MFA'd + locked away, Identity Center configured, **domain registered** — values in §0 | `aws sts get-caller-identity --profile buddypass_prod` → `712934828837` ✓ (2026-07-07) |
| 1 ✅ | `infra/bootstrap/` (state bucket + AWS Budget); `infra/prod/` skeleton on the S3 backend | Bootstrap applied (bucket `buddypass-prod-tfstate-712934828837` + $50/$60 budget); prod `init/plan/apply` clean, state object in S3 ✓ (2026-07-07) |
| 2 ✅ | ECR repos + CI IAM user | `buddypass-prod/{api,web}` live; arm64 images (`9fd3991`) built + pushed from the laptop authenticated as `buddypass-prod-ci` ✓ (2026-07-07) |
| 3 ✅ | VPC + RDS + S3 | RDS endpoint resolves to a private IP (10.0.x.x), unreachable from the internet; bucket spot-check: `exercises/*` public 200, other paths 403 ✓ (2026-07-07) |
| 4 ✅ | EC2 + instance role + SSM params + Route53 zone/records + health-check alarm + `deploy.sh`; api image migration entrypoint | `deploy.sh d110b18` via SSM: ECR login → .env from SSM → migrations vs RDS → up → healthy in 3s; `https://buddy-pass.com/health` 200 with valid TLS, HTTP→HTTPS 308, SPA 200, `/trpc/ping` pongs ✓ (2026-07-07). Gotcha found: RDS forces TLS — `sslmode=require` + RDS CA bundle via `NODE_EXTRA_CA_CERTS` |
| 5 | `deploy.yml` (push-to-main + `workflow_dispatch` sha) | Merge a trivial change to main → new image live with no manual steps; dispatch an older sha → rollback observed |
| 6 | Follow-ups | S3 image sync for the exercise library (deferred MVP §6.4 item) + `IMAGE_BASE_URL` flip; CI-key-rotation note in AGENTS.md |

---

## 6. Known constraints & gotchas

- **arm64 builds**: t4g is Graviton; default GH runners are x86. buildx/QEMU works but is slow; prefer native ARM runners when available. The Apple Silicon laptop builds arm64 natively — permanent break-glass deploy path.
- **Domain is a milestone-4 prerequisite**: registration is the one manual, non-Terraform act (plus ~minutes of NS propagation). Everything downstream reads the single `domain_name` variable.
- **IAM keys are standing credentials**: scope tightly (ECR push to the two repos, `ssm:SendCommand` filtered to the one instance + `AWS-RunShellScript`), rotate on a calendar reminder.
- **Secrets live in Terraform state** (accepted trade-off for rebuild-proof minting) — the state bucket must stay encrypted, versioned, and private; never loosen it.
- **Postgres data**: RDS from day one; the local compose `pgdata` volume concept does not carry over. §2a posture (deletion protection, 7-day PITR, final snapshot) is the safety net.
- **Scale path unchanged** (MVP §7): vertical first → lift the same images to ECS Fargate + ALB. Nothing in this plan (compose file shape, ECR, stateless EC2, TLS at Caddy) blocks that.
