# Buddy Pass — API Plan

> Refined from `MVP.md` via grilling session on 2026-07-06. This is the source of truth for the tRPC API surface. Transport/stack decisions (Fastify, tRPC + superjson, Zod in `packages/shared`, better-auth) are settled in `MVP.md` §2–3 and not revisited here.

Related ADRs: [0001 guest capability tiers](../docs/adr/0001-guest-capability-tiers.md) · [0002 FORBIDDEN vs NOT_FOUND](../docs/adr/0002-forbidden-vs-not-found.md) · [0003 hybrid write granularity](../docs/adr/0003-hybrid-write-granularity.md)

---

## 1. Conventions

### Auth tiers (middleware)

Three procedure builders, each a superset of the last (see ADR-0001):

| Tier         | Session required          | Who                 | Used for                                        |
| --------------| ---------------------------| ---------------------| -------------------------------------------------|
| `public`     | none                      | anyone              | `sharing.resolve` (backs `/s/:token`)           |
| `authed`     | any (incl. **anonymous**) | guests + registered | clone, build, log, profile, accept friend links |
| `registered` | non-anonymous             | registered only     | minting share links & friend links              |

`ctx` carries `{ session, user }`; `authed`/`registered` narrow the types.

### Errors (see ADR-0002)

Standard tRPC error codes only — no custom error union:

- `NOT_FOUND` — resource/token does not exist
- `FORBIDDEN` — exists but caller lacks access (private workout, not a friend) **or** link is revoked. Distinct from `NOT_FOUND` so UX copy can be honest ("this workout is private", "this link was revoked")
- `BAD_REQUEST` — Zod validation, illegal state transitions (e.g. `logging.start` on a completed workout), self-friending
- `UNAUTHORIZED` — tier violation (no session on `authed`, anonymous on `registered`)
- `CONFLICT` — reserved for uniqueness races (e.g. duplicate friendship insert); callers treat as retryable/idempotent success where noted

### Pagination

Cursor-based on UUIDv7 `id` (time-ordered). Convention for every growing list:

```ts
input:  { cursor?: string /* last id of prev page */, limit?: number /* default 20, max 100 */ }
output: { items: T[], nextCursor: string | null }
```

Shaped for React Query `useInfiniteQuery`. Fixed vocab lists (exercises, equipment, muscle groups, friends) are not paginated.

### Data conventions

- Weights **kg canonical** in every input/output; unit conversion is a UI concern (`packages/shared` helpers)
- Dates cross the wire as `Date` via superjson; all UTC
- All ids UUIDv7, generated app-side
- Every input/output schema lives in `packages/shared` (Zod), imported by both router and client
- Rate limiting, three mechanisms matched to transport (tRPC batching means URL-based fastify limits can't target individual procedures): better-auth's built-in limiter for `/api/auth/*`; a small fixed-window per-IP tRPC middleware on the token-guessing surfaces (`sharing.resolve`, `friends.acceptLink`); `@fastify/rate-limit` (`global: false`) on the plain HTTP routes `GET /s/:token`, `GET /f/:token`

### Schema delta required (flagged during API planning)

- **`workouts.name text NOT NULL`** — MVP.md §4 omits it, but the share OG page ("workout name, exercise count"), the clone flow, history lists, and the builder all require a workout title. *Phase 1 shipped without it* — applied at the start of API implementation as migration `0001` (`ADD COLUMN ... DEFAULT 'Workout' NOT NULL` + drop default, so existing dev rows backfill; demo seed sets real names).

---

## 2. Routers

Resource-oriented, mirroring MVP.md §4: `exercises` · `workouts` · `logging` · `profile` · `friends` · `sharing` · `stats`.

### 2.1 `exercises` — library reads (seeded, read-only)

Strategy: **full lightweight index + lazy detail**. ~800 rows is small enough to ship whole; filtering/search is instant client-side. Deliberately **no server-side search endpoint** — do not add one unless the library grows by an order of magnitude.

| Procedure | Tier | Contract |
|---|---|---|
| `exercises.list` | `authed` | `() → ExerciseIndexEntry[]` — the full library. Client caches with `staleTime: Infinity` |
| `exercises.byId` | `authed` | `{ id } → ExerciseDetail` |
| `exercises.filters` | `authed` | `() → { equipments: Equipment[], muscleGroups: MuscleGroup[] }` — vocab for filter chips |

```ts
ExerciseIndexEntry = {
  id, slug, name,
  level: 'beginner' | 'intermediate' | 'expert',
  force: 'push' | 'pull' | 'static' | null,
  mechanic: 'compound' | 'isolation' | null,
  category: string,
  equipment: { id, name } | null,
  primaryMuscles: string[], secondaryMuscles: string[],  // names, for chips
  thumbnail: string | null,   // relative path; client prepends IMAGE_BASE_URL
}

ExerciseDetail = ExerciseIndexEntry & {
  description: string | null,
  instructions: string[],
  images: string[],           // relative paths
}
```

### 2.2 `workouts` — document-style CRUD + clone

Builder writes are **whole-document** and only legal while `status = 'planned'` (see ADR-0003).

| Procedure | Tier | Contract |
|---|---|---|
| `workouts.list` | `authed` | `{ ownerId?, status?, cursor?, limit? } → { items: WorkoutSummary[], nextCursor }` |
| `workouts.byId` | `authed` | `{ id } → WorkoutDoc` |
| `workouts.create` | `authed` | `WorkoutInput → WorkoutDoc` — status always `'planned'` |
| `workouts.update` | `authed` | `{ id } & WorkoutInput → WorkoutDoc` — owner only, `planned` only, full replace |
| `workouts.delete` | `authed` | `{ id } → void` — owner only, any status (cascades exercises/sets) |
| `workouts.clone` | `authed` | `{ source: { token: string } | { workoutId: string } } → WorkoutDoc` |

**Access rules** (shared by `list`/`byId`, and `stats.*`):
- `ownerId` omitted or = self → everything you own
- `ownerId` = a friend → only `visibility = 'friends'` workouts
- `ownerId` = anyone else → `FORBIDDEN`
- `byId` on an existing workout you can't see → `FORBIDDEN`; unknown id → `NOT_FOUND`

**Clone semantics** (one copy routine, two entry points):
- `{ token }` — resolves `share_links`: unknown → `NOT_FOUND`, revoked → `FORBIDDEN`. Bypasses visibility (the token *is* the access grant). Increments `use_count`
- `{ workoutId }` — requires normal view access (own workout → "repeat workout"; friend's visible workout → direct clone)
- Copy: new `workouts` row (owner = caller, `status='planned'`, `origin_workout_id` = source, `scheduled_for = null`, `visibility` = **caller's** `default_workout_visibility` — never the source's) + `workout_exercises` + `workout_sets` structure as-is (`completed_at` never copied)

```ts
WorkoutInput = {
  name: string, notes?: string, scheduledFor?: Date,
  visibility?: 'private' | 'friends',   // omitted → server fills from user_settings
  exercises: Array<{
    exerciseId: string, position: number, superSetId?: string,  // client-generated uuid grouping
    sets: Array<{ position: number, isWarmup: boolean, reps: number, weightKg: number, restSeconds: number }>,
  }>,
}
// `position` (not `order`) end-to-end — matches the DB columns (AGENTS.md: reserved-word avoidance),
// so there is no field rename at the API boundary.

WorkoutSummary = {
  id, name, status, visibility, scheduledFor, startedAt, endedAt,
  ownerId, originWorkoutId,
  exerciseCount: number, setCount: number,
}

WorkoutDoc = WorkoutSummary & {
  notes: string | null,
  exercises: Array<{
    id, position, superSetId: string | null,
    exercise: ExerciseIndexEntry,        // embedded, no second fetch for the logging screen
    sets: Array<{ id, position, isWarmup, reps, weightKg, restSeconds, completedAt: Date | null }>,
  }>,
}
```

`update` replaces children wholesale (delete + reinsert in one transaction). Safe because sets of a `planned` workout are never referenced externally; clones reference only the workout id.

### 2.3 `logging` — the hot path (fine-grained mutations)

Small, single-purpose mutations designed for optimistic updates — and shaped like the events realtime sync mode will need (ADR-0003). All owner-only. Exercise structure is **frozen** once in progress; sets are editable/appendable within existing exercises.

| Procedure | Tier | Contract |
|---|---|---|
| `logging.start` | `authed` | `{ workoutId } → WorkoutDoc` — `planned → in_progress`, `started_at = now` |
| `logging.finish` | `authed` | `{ workoutId } → WorkoutDoc` — `in_progress → completed`, `ended_at = now` |
| `logging.cancel` | `authed` | `{ workoutId } → WorkoutDoc` — `in_progress → cancelled`, `ended_at = now` |
| `logging.completeSet` | `authed` | `{ setId, reps?, weightKg? } → SetRow` — sets `completed_at = now`, applying inline overrides (the common "adjust then check off" gesture = one round trip) |
| `logging.uncompleteSet` | `authed` | `{ setId } → SetRow` — clears `completed_at` |
| `logging.updateSet` | `authed` | `{ setId, reps?, weightKg?, restSeconds?, isWarmup? } → SetRow` — edit without completing; also legal on completed sets (fix typos) |
| `logging.addSet` | `authed` | `{ workoutExerciseId } → SetRow` — "one more set": appends at `order = max + 1`, defaults copied from the exercise's last set |

- Illegal transitions (`start` on `completed`, `completeSet` on a workout not `in_progress`) → `BAD_REQUEST`
- No set removal mid-workout in MVP (uncompleted leftovers are simply ignored by stats); no server-enforced "single active workout" — UI concern
- `planned` workouts are discarded via `workouts.delete`, not `cancel`

### 2.4 `profile` — stats, settings, weigh-ins

| Procedure | Tier | Contract |
|---|---|---|
| `profile.get` | `authed` | `() → { user: { id, name, email, image, isAnonymous }, stats: UserStats | null, settings: UserSettings | null, latestWeighIn: WeighIn | null }` — nulls = onboarding incomplete |
| `profile.completeOnboarding` | `authed` | `{ stats: UserStatsInput, settings: UserSettingsInput, weightKg: number } → ProfileGetOutput` — **one transaction**: `user_stats` + `user_settings` + first `body_measurements` row. Partial onboarding cannot exist |
| `profile.updateStats` | `authed` | `Partial<UserStatsInput> → UserStats` |
| `profile.updateSettings` | `authed` | `Partial<UserSettingsInput> → UserSettings` |
| `profile.logWeight` | `authed` | `{ weightKg, measuredAt?: Date /* default now */ } → WeighIn` |
| `profile.deleteWeighIn` | `authed` | `{ id } → void` |

```ts
UserStatsInput    = { heightCm: number, gender: 'male' | 'female' | 'other', dateOfBirth: Date }
UserSettingsInput = { unitPreference: 'metric' | 'imperial',
                      experienceLevel: 'beginner' | 'intermediate' | 'expert',
                      defaultWorkoutVisibility: 'private' | 'friends' }
```

Age is always computed from DOB (never stored, never returned as a field).

### 2.5 `friends` — invite links + friendship management

Guests may **accept** friend links; only registered users may **mint** them (ADR-0001).

| Procedure | Tier | Contract |
|---|---|---|
| `friends.list` | `authed` | `() → Array<{ id, name, image, friendsSince: Date }>` — not paginated (invite-only friendships stay small) |
| `friends.createLink` | `registered` | `() → { token, url }` — idempotent: returns the existing active link if one exists, else mints |
| `friends.revokeLink` | `registered` | `{ token } → void` — stops *new* friendships only; existing ones persist |
| `friends.acceptLink` | `authed` | `{ token } → { friend: { id, name, image } }` — writes the mutual `accepted` row. Unknown token → `NOT_FOUND`; revoked → `FORBIDDEN`; own link → `BAD_REQUEST`; already friends → idempotent success |
| `friends.remove` | `authed` | `{ friendId } → void` — deletes the friendship row (either direction) |

`GET /f/:token` (plain HTTP) just lands in the SPA, which calls `acceptLink` once a session exists (guest session is created silently if needed).

### 2.6 `sharing` — share links + public resolution

| Procedure | Tier | Contract |
|---|---|---|
| `sharing.resolve` | `public` | `{ token } → { workout: SharedWorkoutView, owner: { name, image } }` — read-only, **non-mutating** (`use_count` increments on *clone*, not view). Unknown → `NOT_FOUND`; revoked → `FORBIDDEN` |
| `sharing.create` | `registered` | `{ workoutId } → { token, url }` — owner only; idempotent (returns active link if one exists) |
| `sharing.revoke` | `registered` | `{ token } → void` — owner only |
| `sharing.listForWorkout` | `registered` | `{ workoutId } → Array<{ token, url, useCount, createdAt, revokedAt }>` — owner only; the viral-analytics view |

`SharedWorkoutView` = `WorkoutDoc` minus `visibility`/`status` noise — name, notes, exercises with sets (structure only, no `completedAt`). The plain HTTP route `GET /s/:token` calls the same resolve service to render OG meta (workout name, exercise count, owner name), then bootstraps the SPA.

### 2.7 `stats` — chart-ready read models

Aggregation happens in SQL; procedures return series ready to plot. `userId` omitted = self; `userId` = a friend → computed **only from `visibility='friends'` workouts** (derived numbers never leak private workouts); anyone else → `FORBIDDEN`.

| Procedure | Tier | Contract |
|---|---|---|
| `stats.volumeOverTime` | `authed` | `{ userId?, bucket: 'day' | 'week' | 'month', from?: Date, to?: Date } → Array<{ bucketStart: Date, totalVolumeKg: number, workoutCount: number }>` |
| `stats.bodyWeight` | `authed` | `{ from?: Date, to?: Date } → Array<{ measuredAt: Date, weightKg: number }>` — **self only** (body weight is not workout-derived and is never shared in MVP) |
| `stats.summary` | `authed` | `{ userId? } → { workoutsCompleted: number, totalVolumeKg: number, currentWeekCount: number, topMuscleGroups: Array<{ name, setCount }>, memberSince: Date }` |

**Volume** = Σ (`reps` × `weight_kg`) over *completed* sets (`completed_at IS NOT NULL`) of *completed* workouts. Warm-up sets excluded.

---

## 3. Auth wiring + file layout (`apps/api`)

### better-auth (v1.6.x) facts pinned during implementation planning

- Instance: `betterAuth({ database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }), emailAndPassword: { enabled: true }, plugins: [anonymous({ onLinkAccount })], advanced: { database: { generateId: () => uuidv7() } } })`. Our Phase 1 tables match the v1.6 core shape (camelCase TS keys on the Drizzle objects are what the adapter reads; `casing: 'snake_case'` maps columns)
- Mounted on Fastify as a catch-all `/api/auth/*` route: convert Fastify req → Fetch `Request`, call `auth.handler(req)`, copy status/headers/body back (`fromNodeHeaders` from `better-auth/node`)
- Guest sessions: `POST /api/auth/sign-in/anonymous`; sign-up: `POST /api/auth/sign-up/email`; sign-in: `POST /api/auth/sign-in/email`. Email verification off for MVP
- **Merge on signup**: `anonymous({ onLinkAccount })` fires when a signed-in guest signs up; hook reassigns guest rows (`workouts`, `user_settings`, `user_stats`, `body_measurements`, `user_friends` — pair-order aware, dedupe vs. existing friendships, `share_links.created_by`, `friend_links`) to the new user id in one transaction; better-auth then deletes the guest row (default behavior)
- Session resolution in tRPC context: `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })` → `{ session, user }` (user carries `isAnonymous`)
- Config via env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (api origin), `APP_ORIGIN` (public web origin — trusted origin for CSRF + base for minted `/s/` `/f/` URLs)
- `buildServer({ databaseUrl })` constructs db + auth + routers per instance (dependency injection → integration tests point the whole server at a testcontainer)

### File layout

```
src/
├── auth.ts               # better-auth instance factory (+ onLinkAccount merge)
├── trpc/
│   ├── context.ts        # session resolution (better-auth) → ctx { db, auth, session, user }
│   ├── trpc.ts           # initTRPC + public / authed / registered builders + rate-limit middleware
│   ├── routers/
│   │   ├── exercises.ts
│   │   ├── workouts.ts
│   │   ├── logging.ts
│   │   ├── profile.ts
│   │   ├── friends.ts
│   │   ├── sharing.ts
│   │   └── stats.ts
│   └── router.ts         # appRouter = router({ exercises, workouts, ... })
├── services/             # access checks + clone/merge/aggregation logic,
│                         #   shared by tRPC routers and plain HTTP routes
└── http/                 # GET /s/:token (OG page), GET /f/:token, /health
```

Access-control logic (`canViewWorkout`, `resolveShareToken`) lives in `services/`, not inline in procedures — the OG page route and future realtime handlers reuse it.

---

## 4. Test targets (per MVP.md §7, testcontainers)

The API behaviors integration tests must pin down:

1. Clone: token path bumps `use_count`; revoked token → `FORBIDDEN`; visibility reset to cloner's default; `completed_at` never copied
2. Visibility: friend sees `friends` workouts only; stranger → `FORBIDDEN`; stats for a friend exclude private workouts
3. Guest → registered merge: guest's workouts/settings/stats/weigh-ins/friendships survive signup (better-auth `onLinkAccount`)
4. State machine: every illegal `logging` transition → `BAD_REQUEST`; `workouts.update` rejected once started
5. Idempotency: `acceptLink` twice, `sharing.create` twice, duplicate friendship race → no duplicates

### Bootstrapping strategy

One testcontainer Postgres per test file (migrate + `seedLibrary` in `beforeAll`), `buildServer({ databaseUrl })` pointed at it. Sessions are minted through the real better-auth HTTP surface (`server.inject` → `/api/auth/sign-up/email` or `/sign-in/anonymous`), capturing the session cookie; tRPC procedures are then exercised through `server.inject` against `/trpc/*` with that cookie — the full stack (session resolution, middleware tiers, superjson) is under test, not a hand-built context. A tiny `trpcCall(server, cookie, proc, input)` helper keeps tests readable.
