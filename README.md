# Buddy Pass

Multiplayer workouts — create and share workouts with friends, track and compare progress.

Plan: [plans/MVP.md](plans/MVP.md) (refined from [plans/INIT.md](plans/INIT.md)) · Infra: [plans/INFRA.md](plans/INFRA.md)

## Stack

pnpm + Turborepo monorepo · Fastify + tRPC + better-auth + Drizzle (Postgres) · Vite React SPA (React Router, React Query, Tailwind v4, shadcn/ui) · Docker · Terraform on AWS

```
apps/api          Fastify + tRPC server
apps/web          Vite React SPA
packages/shared   Zod schemas, domain types, shared utils
packages/db       Drizzle schema, migrations, seeds
```

## Getting started

```sh
corepack enable            # pnpm via packageManager pin
pnpm install
cp .env.example .env
docker compose up -d       # postgres only
pnpm db:migrate            # apply drizzle migrations
pnpm db:seed               # exercise library (873) + demo data
pnpm dev                   # api on :3000, web on :5173 (proxies /trpc + /api)
```

## Commands

| Command                                                     | What                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm dev`                                                  | Run api + web in watch mode                              |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` | Turbo-cached checks                                      |
| `pnpm format`                                               | Prettier write                                           |
| `docker compose --profile full up --build`                  | Prod-parity stack: web on :8080 (Caddy) → api → postgres |

## Production

Runs on AWS (dedicated account, **us-west-2**) at **https://buddy-pass.com** — single EC2 + docker compose + Caddy, RDS Postgres 17, S3, ECR. All infrastructure is Terraform in `infra/` (applied locally via an AWS SSO profile); merges to `main` auto-deploy via GitHub Actions → ECR → SSM. Full plan + runbook details: [plans/INFRA.md](plans/INFRA.md).

## Conventions

- All timestamps `timestamptz` UTC; weights stored in kg; UUIDv7 ids
- Workspace packages are consumed as TypeScript source (`exports` → `src/`)
- API is the only deployable that touches the database
