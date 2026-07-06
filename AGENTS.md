# Buddy Pass — Agent Guide

Root instructions for any agent working in this repo. This file loads on every message; keep it lean.

## Project status

Phase 0 (scaffold) complete. The plan of record is `plans/MVP.md` — grilled and refined from the original brain-dump `plans/INIT.md` (treat INIT as history, not current design). Build phases, schema, and all architecture decisions live in the MVP plan.

Monorepo: pnpm + Turborepo. `apps/api` (Fastify + tRPC), `apps/web` (Vite React SPA, Tailwind v4 + shadcn/ui), `packages/shared` (zod schemas/utils), `packages/db` (Drizzle, schema lands in Phase 1).

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
