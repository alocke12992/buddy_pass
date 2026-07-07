# Buddy Pass — Agent Guide

Root instructions for any agent working in this repo. This file loads on every message; keep it lean.

## Project status

Phases 0–2 complete plus the **full tRPC API surface** (API halves of Phases 3–5); **next is Phase 2.5** (deploy) or the web UI. Plans of record: `plans/MVP.md` (decisions §2, schema §4, progress + delivery notes §9), `plans/API.md` (API contracts, auth tiers, wiring facts), and `plans/INFRA.md` (Phase 2.5 infra/deploy — grilled 2026-07-07; milestone 0 done). `plans/INIT.md` is the original brain-dump (history, not current design).

Monorepo: pnpm + Turborepo. `apps/api` (Fastify + tRPC on :3000), `apps/web` (Vite React SPA on :5173, Tailwind v4 + shadcn/ui), `packages/shared` (zod schemas/utils), `packages/db` (Drizzle schema in `src/schema/`, migrations, seed pipeline).

## API (`apps/api`)

- Three procedure tiers (ADR-0001): `public` / `authed` (guests incl.) / `registered` — builders in `src/trpc/trpc.ts`; business logic lives in `src/services/`, routers stay thin
- better-auth 1.6 at `/api/auth/*` (email/password + anonymous; `onLinkAccount` merges guest data via `services/merge.ts`); session resolved once per request into tRPC context
- Import drizzle operators (`eq`, `and`, `sql`, ...) from `@buddy-pass/db`, never from `drizzle-orm` directly — a second peer-resolved drizzle instance breaks type identity in the api
- `buildServer({ databaseUrl, ... })` is injectable; api integration tests boot it against a testcontainer and drive everything through `server.inject` (helpers in `src/test/harness.ts`)
- tRPC mutations need `content-type: application/json` even with empty bodies; raw SQL fragments need explicit `mapWith` (drizzle decoders don't run on them)
- Env: `BETTER_AUTH_SECRET` required in real deployments; `APP_ORIGIN` = public web origin used for minted `/s/` `/f/` URLs (see `.env.example`)

## Daily dev

```sh
docker compose up -d    # Postgres 17 only
pnpm db:migrate         # drizzle migrations
pnpm db:seed            # exercise library (873) + demo data (idempotent)
pnpm dev                # api (tsx watch) + web (Vite, proxies /trpc + /api)
```

Demo login data: `demo@buddypass.local` user with history + a planned workout shared at token `demoshare123`.

## Verification (run before considering work done)

```sh
pnpm turbo lint typecheck test build   # all packages, Turbo-cached
pnpm format:check                      # CI enforces Prettier (code only; prose dirs ignored)
```

Prod-parity smoke test (when touching Docker/Caddy/compose):

```sh
docker compose --profile full up -d --build --wait
curl -s http://localhost:8080/health          # {"status":"ok"} via Caddy → api
curl -s http://localhost:8080/trpc/ping       # superjson envelope with Date meta
docker compose --profile full stop api web
```

## Scaffold conventions

- Workspace packages are consumed as TypeScript source (`exports` → `./src/*.ts`) — no build step for `packages/*`; `apps/api` bundles them via tsup `noExternal`
- `apps/web` imports ONLY `import type { AppRouter } from '@buddy-pass/api/router'` from the api — never runtime code
- TS 6: `baseUrl` is deprecated — use `paths` relative to the tsconfig
- eslint-plugin-react-hooks v7 flat config lives at `configs.flat.recommended`
- pnpm 10: build scripts must be allow-listed in `pnpm-workspace.yaml` `onlyBuiltDependencies`; `pnpm deploy` needs `--legacy` (used in apps/api/Dockerfile)
- All timestamps `timestamptz` UTC; weights stored in kg; UUIDv7 PKs generated app-side
- Postgres 17 (RDS parity); docker compose default = postgres only, `--profile full` = whole stack

## Database (`packages/db`)

- Drizzle with `casing: 'snake_case'` (set in BOTH `drizzle.config.ts` and the client) — column builders stay name-less, TS keys are camelCase
- Schema changes: edit `src/schema/*.ts` → `pnpm db:generate` → review SQL in `migrations/` → `pnpm db:migrate`. Never hand-edit applied migrations
- auth tables (`user`/`session`/`account`/`verification`) mirror better-auth v1.6 core schema — keep field parity if better-auth is upgraded
- `packages/db/data/exercises.json` is vendored + commit-pinned (sha256 in `src/seed/library.ts`) and prettier-ignored — must stay byte-identical; re-vendor deliberately, watch for GitHub 429 error pages when curling raw content
- db tests run against real Postgres via testcontainers (needs Docker); drizzle wraps pg errors — assert on `error.cause.constraint`
- Exercise ordering uses `position` (not `order`), no unique constraint — app-maintained; friendships require `user_id < friend_id` (canonical pair) — sort UUIDs before insert

## Infrastructure (`infra/`) — Phase 2.5

Plan of record: `plans/INFRA.md` (read it before any infra work). Fixed facts:

- **AWS**: dedicated account `712934828837` ("buddypass_prod", under an Organization), region **us-west-2**. Human access via IAM Identity Center SSO — local profile **`buddypass_prod`** (`aws sso login --profile buddypass_prod`; never long-lived admin keys, never root)
- **Domain**: `buddy-pass.com`, registered in Route53 in that account (hosted zone auto-created). Domain flows from a single `domain_name` TF variable
- **Alerts** (Budget + health-check SNS): `alocke12992+buddypass@gmail.com`
- Terraform ≥ 1.10 (native S3 state locking; installed via `hashicorp/tap`). Applies are **laptop-only** via the SSO profile; CI only pushes images to ECR + triggers `deploy.sh` over SSM. Pin `allowed_account_ids = ["712934828837"]` in every stack
- t4g instances are **arm64** — Docker images must be built for `linux/arm64`

## Design system

The visual design language is settled and lives in `docs/design-system.md` — read it before any UI work. Binding rules:

- **Dark-first, energetic.** Volt (`#C8F542`) always means *you* (actions, progress, success); violet (`#A78BFA`) always means *buddies* (presence, sync, invites). Never mix them; volt doubles as the success color.
- **Tokens only.** Feature code consumes semantic CSS variables / shadcn tokens, never raw hexes. Status enums map to fixed colors per the doc's status table.
- **Glanceable numbers.** `tabular-nums` on all numeric data; Inter only; Lucide icons only; 56px touch targets for mid-workout controls.

## Skills

Reusable procedures and reference live in `.devin/skills/<name>/SKILL.md`, following the Devin/Cascade skill convention. Before authoring or editing any skill, use the `writing-great-skills` skill — it is the authority on structure and pruning, and its `GLOSSARY.md` defines the vocabulary the other skills share.

### Convention

- **One skill per directory**: `SKILL.md` = YAML frontmatter + Markdown body.
- **Frontmatter**: `name` and `description` are required. Set `triggers: [user]` for a skill only the human invokes; omit `triggers` to keep the default `[user, model]` so the agent can auto-invoke it too. Add `argument-hint` when the skill takes an argument.
- **Progressive disclosure**: keep `SKILL.md` short and push detailed reference into sibling files (e.g. `GLOSSARY.md`, `DEEPENING.md`), linked so they load only when needed.
- **Subagents**: describe fan-out work as dispatching a "subagent" (background or exploration), not a tool-specific call signature.
- **Cross-references**: name another skill as `/skill-name`.

### Catalog

Skills marked *(user)* are human-invoked only (`triggers: [user]`); the rest the agent may also auto-invoke.

**Planning & design**
- `grilling` — interview the user one question at a time to stress-test a plan before building.
- `grill-me` *(user)* — start a grilling session.
- `grill-with-docs` *(user)* — grilling that also writes ADRs and glossary via `domain-modeling`.
- `codebase-design` — vocabulary and principles for deep modules (interface, seam, adapter, depth).
- `domain-modeling` — build and sharpen `CONTEXT.md` and ADRs as decisions land.
- `prototype` — throwaway code (logic TUI or UI variants) that answers one design question.
- `research` — background subagent investigates primary sources and writes findings to Markdown.
- `improve-codebase-architecture` *(user)* — scan for deepening opportunities, report as HTML, then grill the pick.

**Building & reviewing**
- `implement` *(user)* — build a PRD/issues end to end: TDD → typecheck → tests → `code-review` → commit.
- `tdd` — the red/green test-first loop and what makes tests worth keeping.
- `code-review` — two-axis review (Standards + Spec) of the diff since a fixed point.
- `resolving-merge-conflicts` — resolve an in-progress merge/rebase, preserving both intents.
- `triage` *(user)* — move issues/PRs through a triage state machine and write agent-ready briefs.

**Meta**
- `writing-great-skills` *(user)* — how to author and edit skills.

## Referenced by skills (create lazily when coding starts)

- `CONTEXT.md` (root) — domain glossary / ubiquitous language, owned by `domain-modeling`.
- `docs/adr/` — ADRs for hard-to-reverse, non-obvious trade-offs.
- `docs/agents/issue-tracker.md` — issue-tracker + label mapping that `code-review` and `triage` look for; if absent, ask the user.
