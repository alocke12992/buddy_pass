# Buddy Pass — MVP Plan

> Refined from `INIT.md` via grilling session on 2026-07-06. INIT.md remains the original brain-dump; this is the source of truth for the MVP build.
>
> **Status:** Phases 0–1 complete (scaffold; schema + ingestion), plus the **full API surface** (plans/API.md — auth, onboarding, workouts, logging, friends, sharing, stats) built and integration-tested. See §9. Next: Phase 2.5 (deploy) or Phase 3 UI (builder + logging screens; their API is ready).

**Vision:** "Multiplayer" workouts — create and share workouts with friends, track and compare progress, eventually work out together in real time. The share/clone loop is the growth engine: anyone can receive a workout link and start using it *without signing up*.

---

## 1. MVP Scope

### In
- **Exercise library** — ~800 exercises seeded from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) with muscles, equipment, difficulty, instructions, images
- **Workout builder** — create a workout from the library (search/filter), order exercises, define sets (reps, weight, rest), supersets
- **Workout logging** — start workout, log sets as completed, edit reps/weight mid-workout, finish/cancel
- **History & progress** — workout history, volume-over-time chart, body-weight chart (`body_measurements`), basic profile stats
- **Friends** — via invite links only (`/f/<token>`); friends list; view friends' workouts subject to visibility
- **Share & clone** — share links (`/s/<token>`); recipient can view and clone; **works without an account** (anonymous guest session); guest data merges into real account on signup
- **Privacy** — per-workout `visibility` (`private` | `friends`), defaulted from a user setting
- **Onboarding profile** — DOB, gender, height, weight, experience level, unit preference (collected now so generation has data on day one)

### Out (fast-follows, in order)
1. **Rule-based workout generation** — goal/cadence/experience-driven; schema is already prepared (see §8)
2. **Real-time sync mode** — live multiplayer workouts (`multiplayer_workouts`, WebSockets)
3. **Challenges** — normalized competition (consistency, volume, % progress)

### Out (later / unordered)
- AI generation via AWS Bedrock (behind the same interface as rule-based generation)
- "How was it" RPE calibration (0/1/2/3/4+/5+ reps left on last set)
- Your Gym (equipment filtering), comments/likes on workouts, granular privacy, directed `workout_invites`, `workout_analytics` (heart rate, calories), React Native app
- Deferred during web planning (2026-07-07, `plans/WEB.md`), revisit post-MVP: **friends activity feed** (Friends tab ships invites + friend-profile browsing; a cross-friend feed wants a `friends.feed` endpoint) · **weekly workout goal + streak** (`user_settings.weekly_workout_goal`, Log-tab goal ring — the FRONTEND.md §1 delta) · **account deletion** (better-auth `deleteUser` not enabled)

---

## 2. Decision Log

| Decision | Choice | Key rationale |
|---|---|---|
| MVP cut line | Solo tracking + friends + share/clone | The social loop is the product identity; realtime/generation are additive |
| Guest flow | Anonymous guest session, merge on signup | Best viral loop; better-auth has this built in |
| Auth | **better-auth** (self-hosted, in our Postgres) | Anonymous plugin = exactly our guest flow; local dev == prod; no external tenant. Auth0 dropped |
| Web app | **Vite React SPA** + backend-rendered OG page for share links | Simple SPA; link previews in iMessage/WhatsApp still work |
| Backend | **Fastify** | TS+Zod integration, WebSocket plugin ready for sync mode, mature |
| ORM | **Drizzle** | TS-first, SQL-transparent for stats queries, better-auth adapter, drizzle-kit migrations |
| API style | **tRPC** (superjson) | End-to-end types, zero codegen, sits on React Query, works in RN later |
| Monorepo | **pnpm workspaces + Turborepo** | Task orchestration + CI caching, low config |
| Schema | Fully normalized (see §4) | No FK arrays; join tables + indexes; store facts once |
| Units | **kg canonical**, `unit_preference` for display | Unit-free math; convert at the UI |
| Time | **timestamptz, UTC everywhere** | Postgres-native UTC storage; display TZ is a frontend concern |
| IDs | **UUIDv7** (generated app-side) | No enumeration leaks, merge-safe, index-friendly (time-prefixed) |
| Share/friend links | Separate short **tokens** (nanoid), never PKs | Revocable, rotatable, trackable (`use_count`), short URLs |
| Friend requests | **Invite links only** for MVP | No search UI/spam surface; doubles as growth loop |
| Privacy | Per-workout `visibility` enum + user default | One column; enum can grow (`public`, per-friend) later |
| Prod target | **Single EC2 + docker compose + Caddy**, RDS, S3 — all Terraform | Max dev/prod parity, ~$30–45/mo; lift to ECS unchanged when needed |
| CI/CD | GH Actions: PR checks, **auto-deploy main** | Lint/typecheck/test/build on PR; build → ECR → deploy on merge |
| Exercise images | Ingest once to **S3**, env-based base URL | No GitHub hotlinking in prod; local dev uses a static folder |
| Testing | **Vitest** unit + integration vs real Postgres (testcontainers) | Clone/merge/visibility logic lives at the DB boundary; mocks lie |
| Workspace packages *(Phase 0)* | Consumed as **TS source** (`exports` → `src/`); api bundles them via tsup `noExternal`; web imports **types only** from `@buddy-pass/api/router` | No build orchestration in dev; single prod artifact; type boundary stays honest |
| Local dev shape *(Phase 0)* | Compose default = **postgres only**; api/web run on host (`pnpm dev`); `--profile full` = prod-parity images | Fast HMR on macOS; the real Caddy→api→postgres stack is still one command away |
| Node / Postgres *(Phase 0)* | **Node 22 LTS** (was 24 in plan), **Postgres 17** | Local toolchain parity; solid RDS support; UUIDv7 generated app-side so PG18 not needed |

---

## 3. Architecture

```
buddy_pass/
├── apps/
│   ├── api/            # ✅ Fastify + tRPC + better-auth + OG share pages (full surface per plans/API.md)
│   └── web/            # ✅ Vite React SPA (Router, React Query, Tailwind v4, shadcn/ui) — feature UI = Phases 3–5
├── packages/
│   ├── db/             # ✅ Drizzle schema + migrations + seed pipeline
│   └── shared/         # ✅ Zod schemas (incl. API input contracts), domain types, unit conversion
├── infra/              # Terraform (VPC, EC2, RDS, S3, ECR, IAM) — Phase 2.5
├── docker-compose.yml  # ✅ postgres (default) + api/web under --profile full
└── turbo.json          # ✅
```

- `apps/mobile` (React Native/Expo) slots in later, reusing `packages/shared` + the tRPC client. shadcn/ui does not transfer; UI is per-platform.

### Backend (`apps/api`) — ✅ built, see plans/API.md
- Fastify (`trustProxy` on — always behind Caddy/Vite proxy); tRPC router mounted at `/trpc`; better-auth mounted at `/api/auth/*`
- Plain HTTP routes: `GET /s/:token` (share page w/ OG meta), `GET /f/:token` (friend link landing), `/health`
- better-auth plugins: email/password + **anonymous** (guest sessions, `onLinkAccount` hook migrates guest data on signup)
- Rate limiting on token surfaces (tokens are 12+ char nanoid — high entropy, but belt & suspenders): per-IP tRPC middleware on `sharing.resolve`/`friends.acceptLink`, `@fastify/rate-limit` on `/s/:token` `/f/:token`, better-auth's built-in limiter on auth endpoints
- Zod schemas from `packages/shared` validate all inputs

### Frontend (`apps/web`)
- Vite + React + TS, React Router, tRPC client (on React Query), React Hook Form, shadcn/ui
- State: React Context per INIT.md conventions — top-level `context/` folder, one subfolder per domain (e.g. `context/Authentication/`), context + provider in separate files, `index.ts` exports both. Server state lives in React Query, *not* Context — Context is for session/UI state only
- Display-unit conversion (kg ↔ lb) at the component boundary via `packages/shared` helpers

---

## 4. Data Model

All tables: `id` UUIDv7 PK (app-generated via Drizzle `$defaultFn`), `created_at` / `updated_at` timestamptz (UTC). Weights in `numeric` kg.

### Auth (owned by better-auth)
`user`, `session`, `account`, `verification` — generated by better-auth's Drizzle adapter. `user` carries `name`, `email`, `image`, `isAnonymous` (anonymous plugin). **No password column anywhere in our tables** — credentials live in better-auth's `account`.

### Profile
```
user_stats         user_id FK → user, height_cm, gender, date_of_birth
                   (age is always computed from DOB — never stored)

body_measurements  user_id, weight_kg, measured_at
                   INDEX (user_id, measured_at DESC)
                   -- one row per weigh-in; "current weight" = latest row
                   -- future: additive nullable columns (body_fat_pct, waist_cm, ...)

user_settings      user_id, unit_preference ('metric'|'imperial'),
                   experience_level ('beginner'|'intermediate'|'expert'),
                   default_workout_visibility ('private'|'friends')
                   -- generation fields (goal, cadence, variability, duration)
                   -- arrive with fast-follow #1
```

### Exercise library (seeded, read-only to users)
```
equipments         name UNIQUE, type, photo?, description?
                   -- seeded from free-exercise-db vocab (~12 values)

muscle_groups      name UNIQUE, description?
                   -- seeded vocab (~17 values)

exercises          slug UNIQUE (source id), name, description?,
                   category, force? ('push'|'pull'|'static'),
                   mechanic? ('compound'|'isolation'),
                   level ('beginner'|'intermediate'|'expert'),
                   instructions jsonb (string[]), images jsonb (paths),
                   equipment_id FK? → equipments   -- single, nullable: matches source data
                   -- force/mechanic/level ingested NOW so generation
                   -- (fast-follow #1) needs no migration/re-ingest

exercise_muscles   exercise_id FK, muscle_group_id FK,
                   role ('primary'|'secondary')
                   UNIQUE (exercise_id, muscle_group_id, role)
```

### Workouts
```
workouts           owner_id FK → user, name text NOT NULL,
                   status ('planned'|'in_progress'|'completed'|'cancelled'),
                   visibility ('private'|'friends'),   -- default from user_settings
                   scheduled_for? timestamptz, started_at?, ended_at?,
                   notes?, origin_workout_id? FK → workouts
                   INDEX (owner_id, status), INDEX (origin_workout_id)
                   -- name added by migration 0001 (API-phase schema delta, plans/API.md §1):
                   --   share OG page, clone flow, and history lists all need a title
                   -- duration = ended_at - started_at (never stored)
                   -- clones of X = WHERE origin_workout_id = X (no cloned_ids array)
                   -- INIT.md's date → scheduled_for; user_id+creator_id → owner_id
                   --   (attribution for clones = origin chain)

workout_exercises  workout_id FK, exercise_id FK, position,
                   super_set_id? (uuid, groups exercises into a superset)
                   INDEX (workout_id, position)
                   -- (as built) named position, not order: avoids a quoted reserved
                   --   word in raw SQL; no UNIQUE on position so drag-reorder can
                   --   shuffle rows freely — ordering is app-maintained

workout_sets       workout_exercise_id FK, position, is_warmup bool,
                   reps int, weight_kg numeric(6,2), rest_seconds int default 90,
                   completed_at? timestamptz   -- null = not done; doubles as timestamp
                   INDEX (workout_exercise_id, position)
                   -- no denormalized workout_id; reachable via workout_exercises.
                   --   add later only if a hot query demands it
                   -- last set's rest not auto-played (UI concern, per INIT.md)
```

### Social
```
user_friends       user_id FK, friend_id FK,
                   status ('pending'|'accepted'),  -- MVP always writes 'accepted'
                   CHECK (user_id < friend_id) + UNIQUE (user_id, friend_id)
                   -- (as built) canonical pair ordering enforced by CHECK instead of a
                   --   least/greatest expression index — simpler, same guarantee
                   -- opening a friend link = mutual consent → instant friendship;
                   -- 'pending' reserved for future search-based requests

share_links        workout_id FK, token UNIQUE (nanoid ~12), created_by FK,
                   use_count int, revoked_at?
                   -- revocable/rotatable; use_count = viral analytics

friend_links       user_id FK (creator), token UNIQUE, revoked_at?
```

### Deferred tables (do not build; schema is additive when they arrive)
`multiplayer_workouts` (sync), `workout_invites` (sync — directed invites), `user_recovery` (generation — and first try *deriving* it from workout history: last completed set per muscle via `workout_sets → workout_exercises → exercise_muscles`; materialize only if slow), `user_gym`, `workout_analytics`.

---

## 5. Key Flows

### Share → guest clone → merge (the growth loop)
1. Owner taps Share → `share_links` row with fresh token → `https://<host>/s/<token>`
2. Recipient opens link. API's `/s/:token` returns server-rendered HTML with OG meta (workout name, exercise count, owner name if visible) that bootstraps/redirects into the SPA — so iMessage/WhatsApp previews render
3. SPA shows workout read-only + "Clone this workout"
4. No account → better-auth **anonymous session** created silently; clone executes: copy `workouts` row (new owner, `origin_workout_id` set, status `planned`) + `workout_exercises` + `workout_sets` structure as-is; increment `use_count`
   - *Clone-time weight personalization (regenerate sets/weights per the cloner's profile) arrives with generation fast-follow — MVP copies as-is; recipient edits while logging*
5. Guest logs workouts like a normal user (session cookie in localStorage/cookie)
6. Guest signs up → better-auth `onLinkAccount` → reassign guest's rows (`workouts`, `user_settings`, `user_stats`, `body_measurements`, `user_friends`) to the real user id, delete guest user
7. Cleanup job: purge anonymous users with no activity for 90 days

### Friend link
1. User generates `friend_links` token → sends anywhere
2. Opener (logged in or after guest/signup) hits `/f/:token` → mutual `user_friends` row written with `accepted`
3. Friends see each other's `visibility='friends'` workouts + stats computed **only from friends-visible workouts** (consistent privacy: derived numbers never leak private workouts)

### Logging a workout
Create (from library or clone) → `planned` → Start (`in_progress`, `started_at`) → check off sets (`completed_at`), edit reps/weight inline, rest timer from `rest_seconds` (skip auto-play on last set of each exercise) → Finish (`completed`, `ended_at`) or Cancel.

---

## 6. Seed / Ingestion Pipeline (`packages/db`) — ✅ built in Phase 1

1. ✅ `data/exercises.json` vendored, pinned at commit `5197c05` (873 exercises; sha256 recorded in `src/seed/library.ts`; dir is prettier-ignored to stay byte-identical)
2. ✅ `seedLibrary()`: upserts `equipments` (12, with coarse `type`: free_weight/machine/accessory/bodyweight/other) + `muscle_groups` (17); zod-validates the vendored file against the source contract (`src/seed/source-schema.ts`) so vocab drift fails loudly
3. ✅ Upserts `exercises` keyed by `slug` (chunked, `onConflictDoUpdate`); rebuilds `exercise_muscles` wholesale (2,583 rows) so source removals propagate
4. Sync images to S3 (`exercises/<slug>/<n>.jpg`) — **deferred to Phase 2.5** (no bucket yet); DB already stores relative paths; base URL from env (`IMAGE_BASE_URL`): local dev = static folder or dev bucket, prod = S3 (CloudFront later)
5. ✅ Nulls in source `force`/`mechanic`/`equipment` stay null — future generator excludes unlabeled exercises from push/pull selection rather than guessing
6. ✅ Idempotent: `pnpm db:seed` (library + demo) / `db:seed:library` (library only); demo data (demo user + friend, settings/stats/measurements, 1 completed push workout, 1 planned pull workout with share link `demoshare123`) skips itself if present

---

## 7. Local Dev, Testing, CI/CD, Production

### Local (as built in Phase 0)
- Daily dev: `docker compose up -d` (Postgres 17 only) + `pnpm dev` (api via tsx watch on :3000, web via Vite on :5173 proxying `/trpc` + `/api`)
- Prod parity on demand: `docker compose --profile full up --build` — the real images (Caddy-served SPA on :8080 → api container → postgres), same shape that ships to EC2
- `pnpm db:migrate && pnpm db:seed` for setup (lands Phase 1); `.env.example` documented
- Node 22 LTS (matches local toolchain; supported to Apr 2027), pnpm 10 + Turborepo; ESLint 10 (flat) + Prettier (code only — prose dirs ignored)

### Testing
- **Vitest** everywhere; Turborepo runs per-package
- ✅ API integration tests hit a real Postgres via **testcontainers**: clone semantics, guest→account merge, visibility rules, link revocation — the logic mocks lie about (45 tests, driven over HTTP through the real server; harness in `apps/api/src/test/harness.ts`)
- `packages/shared` pure unit tests (conversions, zod schemas)
- Playwright E2E deferred until the UI stabilizes (first candidate: share → guest clone → signup merge)

### CI/CD (GitHub Actions)
- **PR + main:** ✅ format check + turbo lint/typecheck/test/build (`.github/workflows/ci.yml`)
- **Merge to main (deploy — Phase 2.5):** build images → push ECR → run drizzle migrations against RDS → SSM/SSH to EC2 → `compose pull && compose up -d`
- Secrets in GH Actions secrets + `.env` on the box (SSM Parameter Store when it grows)
- Refined in `plans/INFRA.md` (2026-07-07): SSM Run Command (not SSH), migrations run on the box (not from Actions), SSM Parameter Store from day one

### Production (Terraform in `infra/`)
- **EC2** t4g.small: runs `caddy` (TLS + static `web` build + reverse proxy `/trpc`, `/api`, `/s/`, `/f/` → api container) + `api` container via compose
- **RDS** Postgres db.t4g.micro (private subnet, SG from EC2 only), automated backups
- **S3** exercise images + assets; **ECR** for images; Elastic IP + Route53; IAM instance role (ECR pull, S3 read)
- ~$30–45/mo. **Scale path:** vertical first → lift the same containers to ECS Fargate + ALB (images/compose already shaped for it) → managed Redis when sync mode needs multi-instance pub/sub

---

## 8. Future-Proofing Notes (no MVP work, just don't break these)

- **Generation (fast-follow #1):** all inputs already captured — `force`/`mechanic`/`level`, `experience_level`, DOB/gender/height, weight history, muscle roles. Build as a pure function in `packages/shared` (profile + history + constraints → workout plan) so rule-based and Bedrock-backed implementations are swappable behind one interface
- **Sync mode (#2):** Fastify supports `@fastify/websocket`; single instance = in-process pub/sub; add Redis only at multi-instance. Adds `multiplayer_workouts` + `workout_invites`. Default-weight rule from INIT.md: first set → generation fallback; else copy previous set
- **Challenges (#3):** normalized scoring (% change) so different strength levels compete fairly — needs only completed-workout history, which MVP accumulates from day one
- **React Native:** tRPC client + `packages/shared` reuse; better-auth has an Expo client. Keep business logic out of web components
- **"How was it" RPE:** future `workout_sets.reps_in_reserve` nullable column — additive

---

## 9. Build Order

| Phase | Status | Deliverable                                                                                                                                         |
| -------| --------| -----------------------------------------------------------------------------------------------------------------------------------------------------|
| 0     | ✅ done (`9abc71a`) | Scaffold: Turborepo + pnpm, tsconfig/eslint/prettier, docker compose, CI skeleton (lint/typecheck/test on PR)                                       |
| 1     | ✅ done | `packages/db`: Drizzle schema (§4) + migrations; ingestion/seed pipeline (§6)                                                                       |
| 2     | ✅ done | Auth: better-auth (email/password + anonymous) wired into Fastify + tRPC context; onboarding (stats/settings) — shipped as part of the API build (see notes below) |
| 2.5   | —      | **Deploy early:** Terraform prod stack + deploy pipeline live with just auth + library browsing — derisks infra assumptions before features pile up. Plan of record: `plans/INFRA.md` |
| 3     | API ✅ | Workout builder + logging: exercise picker (search/filter), sets/supersets, logging UX, history — **UI remains**; tRPC surface + tests shipped      |
| 4     | API ✅ | Progress: volume-over-time, body-weight chart, profile stats — **UI remains**; tRPC surface + tests shipped                                         |
| 5     | API ✅ | Social: friend links, friends list, visibility enforcement, share links + OG page, guest clone, merge-on-signup, link revocation — **UI remains**   |
| 6     | —      | Polish: empty states, error handling, responsive pass, rate limiting (✅ done in API), guest-cleanup job                                            |

Then fast-follow #1 (generation) gets its own planning round.

### Phase 0 delivery notes (2026-07-06)

- Everything verified end-to-end: 14/14 turbo tasks green; tRPC ping flows web → Vite proxy → api with superjson `Date` round-trip; both Docker images build and the `--profile full` stack came up healthy behind Caddy on :8080
- Beyond the plan line-item: shadcn/ui initialized (button seeded), Prettier format check added to CI, `AGENTS.md` carries the verification commands + toolchain gotchas (TS 6 `baseUrl` removal, react-hooks v7 flat config, pnpm 10 `onlyBuiltDependencies` / `deploy --legacy`)
- api Docker image = tsup bundle + `pnpm deploy --legacy --prod` pruned runtime; web Docker image = Caddy serving static build + proxying `/trpc` `/api` `/s/` `/f/` `/health`

### Phase 1 delivery notes (2026-07-06)

- Schema (§4) implemented in `packages/db/src/schema/` (auth / profile / exercises / workouts / social + relations + shared enum types); single migration `0000_abandoned_jackpot.sql`: 17 tables, 10 pg enums, all FKs/indexes/checks
- better-auth tables pre-created to the v1.6 core shape (+ `is_anonymous`) with UUID pks — Phase 2 wires the drizzle adapter + `generateId: uuidv7` with zero migration
- `experience_level` enum intentionally shared between user settings and exercise difficulty (same 3-value vocab)
- Deviations from §4 as originally written, both annotated inline: `position` instead of `order` (reserved word; no UNIQUE so drag-reorder is free), friendship canonical pair via `CHECK (user_id < friend_id)` instead of least/greatest expression index
- Verified: 7 vitest integration tests against a real Postgres 17 via testcontainers (seed idempotency incl. 873-exercise count, muscle-role mapping spot-check, UUIDv7 format, demo no-op re-run, numeric→number mode, pair-order + unique constraint rejection, user-deletion cascade); `db:migrate` + `db:seed` run clean against compose postgres (sanity SQL: counts + Barbell Squat mapping + demo share link)
- Gotcha for later phases: drizzle wraps pg errors — constraint names live on `error.cause.constraint`, not the message

### API delivery notes (2026-07-07)

Plan of record: `plans/API.md` (§3 has the wiring facts). Everything in that plan is implemented and tested — Phase 2 in full, plus the API halves of Phases 3–5.

- Migration `0001_thin_lester.sql` applied the flagged schema delta (`workouts.name NOT NULL`, backfill-safe); demo seed now names its workouts ('Push Day' / 'Pull Day')
- `apps/api` structure per API.md §3: `auth.ts` (better-auth 1.6.23 factory), `trpc/` (context, tiers, 7 routers), `services/` (access, workouts, clone, sharing, stats, merge), `http/routes.ts` (`/s/:token` OG page, `/f/:token` redirect)
- better-auth wired with drizzle adapter on the Phase 1 tables (zero migration, as designed), `generateId: uuidv7`, anonymous plugin with `onLinkAccount` → transactional guest-data merge (`services/merge.ts`); its Fastify catch-all uses a scoped raw-string JSON parser so empty auth POSTs survive
- `buildServer({ databaseUrl, ... })` is fully injectable — integration tests boot the real server against a testcontainer and drive it through HTTP (`server.inject`): real cookies, real superjson, no hand-built contexts
- 45 vitest tests across 4 files pin down all five API.md §4 targets: clone semantics (use_count, revocation, visibility reset, completed_at never copied), visibility (friend/stranger/unknown), guest→registered merge (incl. friendship pair-order rewrite + guest row deletion), the logging state machine, idempotency (createLink/acceptLink/sharing.create), plus stats privacy math, OG pages, and rate limiting
- Env additions: `BETTER_AUTH_SECRET` (+ `BETTER_AUTH_URL`, `APP_ORIGIN` optional) — see `.env.example`; compose `--profile full` passes prod-shaped values; api dev script now loads root `.env` via `--env-file-if-exists`
- Gotchas recorded for later phases: consume drizzle operators via `@buddy-pass/db` re-exports (a second peer-resolved drizzle-orm instance breaks type identity); raw SQL fragments bypass drizzle's decoders (map `date_trunc` etc. with `mapWith`); tRPC mutations require `content-type: application/json` even with empty bodies (415 otherwise)
- Prod-parity smoke test surfaced two packaging fixes: `pg` is CJS and cannot be bundled into the ESM api build (tsup `external: ['pg']` + direct api dependency so `pnpm deploy` links it); the web image must copy `packages/db` since web's `tsc -b` follows `AppRouter` types into api source. Full `--profile full` stack verified through Caddy on :8080 (health, ping, OG share page, anonymous session → `profile.get`)
- Post-review adjustments (same day): Fastify `trustProxy: true` — the api always sits behind Caddy/Vite proxy, and without it `req.ip` is the proxy's address, collapsing every user into one rate-limit bucket (and better-auth would log proxy IPs); friendship `created_at` carried through the guest merge so `friendsSince` survives signup; OG description pluralizes its exercise count
