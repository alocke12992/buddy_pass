# Buddy Pass — Web Implementation Plan (Phases 3–5 UI)

> Drafted 2026-07-07 from `FRONTEND.md` (UX source of truth: flows, screens, route map) + `docs/design-system.md` (visual language) + `plans/API.md` (contracts). This doc owns what those defer: component architecture, build order, and the small deltas needed to serve the UI. API contracts and UX flows are not revisited here.
>
> **Status: all milestones 0–9 delivered 2026-07-07** (delivery notes §6).

---

## 1. Decisions

| Decision | Choice | Why |
| ---------- | -------- | ----- |
| Build order | **Foundations → Phase 3 → 4 → 5 → polish** (milestones §4), each independently verifiable against a FRONTEND.md flow | Matches MVP §9 phase order; the design target (live logging) lands early |
| Font | **Geist stays**; `docs/design-system.md` amended (supersedes "Inter only") | Already installed + wired in Phase 0; visually equivalent for the system's needs (variable, tabular-nums support) |
| Exercise images (pre-2.5) | **Local static folder** `apps/web/public/exercise-images/` (gitignored), filled by an idempotent fetch script in `packages/db` (`pnpm db:images`) from the pinned source commit `5197c05`; client prepends `VITE_IMAGE_BASE_URL` (default `/exercise-images`) | Offline-friendly dev, no GitHub hotlinking; the script doubles as the fetch half of INFRA M6's S3 sync; env flip at Phase 2.5 |
| Missing-image fallback | Initial-letter tile component, mandatory wherever exercise images render | Prod serves no images until INFRA M6 syncs S3 — 404s must degrade gracefully |
| Reorder | **dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) from day one | FRONTEND.md §3.2 calls for drag handles incl. touch; retrofitting dnd is worse than starting with it |
| Charts | **Recharts** via shadcn chart primitives | Two simple time-series charts; shadcn integration matches the token system |
| Log calendar | **react-day-picker** (shadcn calendar) + **date-fns** for week math | Month grid + custom day dots without hand-rolling calendar layout |
| Forms | **React Hook Form** + `@hookform/resolvers` + shared Zod schemas | MVP §3 convention; field-level errors per FRONTEND.md §5 |
| Auth client | **better-auth React client** pinned `^1.6.23` (match server), `anonymousClient` plugin, same-origin `/api/auth` (Vite proxy dev / Caddy prod) | Version skew between client and server plugins is a real failure mode; same-origin avoids all CORS/cookie config |
| Session state | `context/Authentication/` wrapping the better-auth client (context + provider in separate files, `index.ts` exports both) | INIT.md/MVP §3 convention: Context for session/UI state only; server state stays in React Query |
| Guest sessions | Created **silently and lazily** — only by the `/share/:token` clone and `/friend/:token` accept actions, never on app open | FRONTEND.md §3.10–3.11; logged-out visitors otherwise land on `/welcome` |
| Optimistic updates | Logging hot-path mutations (`completeSet`, `uncompleteSet`, `updateSet`) patch the `workouts.byId` cache via React Query `onMutate` | ADR-0003 shaped these mutations for exactly this |
| Toasts | **sonner** (shadcn) for mutation failures; inline retry cards for query failures | FRONTEND.md §5 |
| Dark-only | `:root` carries the dark tokens directly; no `.dark` class plumbing yet | Design system: dark is the source of truth, light is a later derived theme |
| Friend accents | Derived client-side: friends sorted by `friendsSince`, colors assigned in the design-system order, cycling; hex list lives in `packages/shared` | No schema change; stable except when a removal reshuffles later friends — accepted for MVP (design-system.md notes the constant's home) |
| Web testing | Vitest on extracted pure logic (hero-card priority, rest-timer hook via fake timers, display-unit formatting); no component-test suite yet; Playwright deferred per MVP §7 | The risky logic is pure and cheap to pin; UI churn would make component snapshots noise |

---

## 2. Deltas

### 2a. Backend (milestone 0 — small, test-covered)

1. **Demo seed additions** — (a) stable friend-link token `demofriend123` so any dev user can befriend the demo user and see real buddy data; (b) credential `account` row for `demo@buddypass.local` / `demo1234` using a pre-computed better-auth scrypt hash constant, so "sign in as demo" actually works (today the demo user has no credentials — AGENTS.md's "demo login" is data-only). Gotcha: the hash constant is coupled to better-auth's scrypt params — regenerate if better-auth is upgraded.

**Deferred post-MVP** (decided 2026-07-07, recorded in MVP.md §1 "Out"): `friends.feed` endpoint (Friends tab ships without the activity feed), `user_settings.weekly_workout_goal` + streak (Log tab ships without goal ring/streak), better-auth `deleteUser` (Settings ships without the danger zone).

### 2b. Plan-doc corrections (✅ applied 2026-07-07)

- **FRONTEND.md §2 route map**: SPA routes are **`/share/:token`** and **`/friend/:token`** — `/s/` `/f/` are api-owned surfaces (OG page / redirect) that bounce humans into the SPA. Already built this way (`apps/api/src/http/routes.ts`); the route table predated it. Deferral annotations added to §1/§3.5/§3.7/§3.13/§3.14/F6.
- **design-system.md** + AGENTS.md: Geist recorded as the type family (decision above).

---

## 3. Architecture (`apps/web`)

New deps: `better-auth` (client), `react-hook-form`, `@hookform/resolvers`, `@buddy-pass/shared` (workspace), `date-fns`, `@dnd-kit/core`, `@dnd-kit/sortable`, `recharts` + `sonner` + `react-day-picker` (via shadcn add). Dev: none beyond existing vitest.

```
src/
├── main.tsx            # providers + route tree
├── index.css           # design tokens (dark), typography scale, numeric utility
├── lib/                # trpc.ts, auth-client.ts, images.ts (base URL + fallback), format.ts (weights/dates/durations)
├── context/
│   └── Authentication/ # context.ts + provider.tsx + index.ts
├── components/
│   ├── ui/             # shadcn primitives (generated)
│   └── app/            # AppShell, TabBar/Sidebar, ResumeBanner, StatusBadge, EmptyState, ErrorCard, skeletons
├── pages/              # one folder per screen area; screen-local components/hooks colocated
│   ├── home/  log/  friends/  profile/  settings/
│   ├── workout/        # builder/ (incl. picker/), live/, summary/, detail/
│   ├── auth/           # welcome, sign-in, sign-up
│   ├── onboarding/
│   └── links/          # share landing, friend landing, dead-link screen
└── hooks/              # cross-screen only (e.g. useRestTimer if reused)
```

Conventions:

- **kg canonical in all state**; convert only at render via `packages/shared` helpers + `settings.unitPreference`. Inputs accept display units and convert on change.
- **Status → color lives in one `StatusBadge`** per the design-system status table; no ad-hoc colors in feature code.
- Numbers always get the `tabular-nums` utility; the typography scale (`display`/`stat`/`h1`/`h2`/`label`) is defined once in `index.css` as utilities.
- Every list/hero screen ships skeleton + empty + error (retry) states with the feature, not in a later pass — Phase 6 polish is a sweep, not a build.
- Resume banner = a `workouts.list({ status: 'in_progress', limit: 1 })` query in the shell, not Context.

---

## 4. Milestones (each independently verifiable)

| # | Deliverable | Verified by |
| --- | ------------- | ------------- |
| 0 ✅ | Demo seed additions §2a (credential row + `demofriend123`) | Sign in as `demo@buddypass.local` / `demo1234` through the real auth endpoint; fresh user accepts `demofriend123` → friendship; seed re-run is a no-op; `pnpm turbo lint typecheck test build` green |
| 1 ✅ | Theme + shell: design tokens (dark), typography utilities, shadcn re-skin, AppShell (bottom tabs <1024px / sidebar ≥1024px), full route skeleton with placeholder screens, shared kit (StatusBadge, EmptyState, ErrorCard, skeletons) | Every route renders themed at both breakpoints; visual pass against design-system.md (volt primary, surfaces, radii); turbo green |
| 2 ✅ | Auth + onboarding: auth client + Authentication context, session bootstrap + route guards (logged-out → `/welcome`; guests see all tabs), Welcome / Sign-in / Sign-up, onboarding wizard (step 1 required; steps 2–3 skippable → defaults `beginner` / `private`, editable in Settings; step 3 = default visibility only, goal deferred), guest→signup upgrade path | F1 first leg manual E2E (welcome → sign-up → onboarding → Home empty); sign in as demo works; guest signup merge preserves data (seeded via share-token clone) |
| 3 ✅ | Image pipeline: `pnpm db:images` fetch script, `VITE_IMAGE_BASE_URL` + `images.ts` helper + fallback tile | ~1,746 files land under `public/exercise-images/`; re-run is a no-op; thumbnail + fallback both render |
| 4 ✅ | Home + Builder + Picker: hero priority (in-progress → next planned → empty) + Start/Reschedule/Edit, builder create/edit (sets, warm-up, supersets via link-with-previous, dnd-kit reorder, discard-changes guard), picker sheet (client-side search/filter over `exercises.list`, multi-add, mini detail), save sheet (schedule + visibility) | F1 create path + F3 repeat path E2E; hero-priority unit tests; builder edit round-trip preserves structure incl. superset grouping |
| 5 ✅ | Live logging + summary: `logging.start` on Start, set rows with 56px steppers, optimistic complete/uncomplete/update, `addSet`, rest timer (auto-start on completion **except last set of exercise**, ±15s/skip), elapsed timer, finish/cancel confirmations, global resume banner, summary (duration/volume/sets, per-exercise, guest signup CTA; **no PR callouts** — FRONTEND.md open Q2) | F2 E2E incl. leave-and-resume; illegal transitions surface as toasts; rest-timer unit tests (fake timers) |
| 6 ✅ | Log + workout detail: month calendar strip with volt/muted dots + day filter, stats row (this-week count + total completed — goal ring/streak deferred per §2a), history list, detail's three contexts (own completed: Repeat/Share/visibility · own planned: Start/Edit/Reschedule/Delete · friend/shared: Clone) | F3 E2E; day filter incl. planned-future days; FORBIDDEN/NOT_FOUND → "isn't available" screen |
| 7 ✅ | Profile + Settings: stats block (`stats.summary`), volume + body-weight charts, weigh-in sheet, Settings (units/visibility/experience, body basics, email display, change password, sign out — danger zone deferred per §2a) | F7 E2E; unit flip re-renders every weight in the app; charts show placeholder under 2 points |
| 8 ✅ | Social: Friends tab (accent avatar row + invite CTA — feed deferred per §2a), friend profile (visible workouts + privacy-scoped stats, remove), invite sheet (create/copy/revoke), share sheet (copy/use-count/revoke + private-visibility reminder; guests get signup CTA per ADR-0001), `/share/:token` + `/friend/:token` landings with silent guest sessions, dead-link + already-friends states | F4 + F5 E2E against demo tokens (`demoshare123`, `demofriend123`) incl. revoked/invalid tokens; guest clone → signup merge keeps workout; F6 clone path via friend profile |
| 9 ✅ | Polish (Phase 6): empty/error/skeleton sweep, error boundary, responsive ≥1024px audit, `prefers-reduced-motion`, focus rings, a11y labels on icon buttons, volt check-pop + celebration moments | Manual checklist sweep of every FRONTEND.md §3 screen's states; `--profile full` prod-parity smoke; turbo green |

Milestones land as individual commits/PRs in this order; 4→5 and 6→7 pairs may interleave if convenient, but each verification bar holds before moving on.

---

## 5. Gotchas & constraints

- **superjson Dates**: tRPC outputs carry real `Date` objects — never re-parse; format via `format.ts` only.
- **Whole-doc builder writes** (ADR-0003): `workouts.update` is full-replace and `planned`-only. Reschedule = fetch doc → resubmit with new `scheduledFor`. Never attempt structure edits on an `in_progress` workout — only `logging.*` mutations are legal there.
- **`exercises.list` is cached forever** (`staleTime: Infinity` per API.md) — all picker search/filtering is client-side; do not add server search.
- **Guest tier walls** (ADR-0001): `isAnonymous` users never see mint-link UI (share sheet, invite sheet) — they get the signup CTA instead. Clone/accept/log all work for guests.
- **Error-code UX** (ADR-0002): `FORBIDDEN` on links/workouts gets honest copy ("revoked", "private"), `NOT_FOUND` gets the dead-link screen — don't collapse them.
- **Images 404 in prod** until INFRA M6 flips `IMAGE_BASE_URL` to S3 — the fallback tile is a requirement, not decoration.
- **Demo scrypt constant** (§2a.1) is coupled to better-auth's hash params — regenerate alongside any better-auth upgrade (AGENTS.md already flags upgrade care).
- **Anonymous session creation is rate-limited territory** — the landings create guests only on explicit user action (Clone/Accept click), which also keeps link prefetchers from consuming friend links (FRONTEND.md §3.11).
- Toolchain quirks per AGENTS.md: TS 6 `paths` (no `baseUrl`), react-hooks v7 flat config, pnpm 10 `onlyBuiltDependencies`.

---

## 6. Delivery notes (2026-07-07)

All milestones landed as individual commits (`7e8bf11` → M9), each gated on `pnpm turbo lint typecheck test build` + `format:check`; flows F1–F7 exercised end-to-end through the Vite proxy and the final prod-parity `--profile full` smoke (health, superjson ping, OG bounce, anonymous session via Caddy).

- **Structure as planned (§3)** plus: `lib/api-types.ts` (`inferRouterOutputs` — the only api import is the type), `pages/workout/live/` (interleaved-order + rest-timer pure modules), `pages/workout/builder/state.ts` (immutable editor model). 30 web unit tests (5 files) cover hero priority, superset normalization, interleave/current-set/summary math, rest-timer, and log-day bucketing; height/weight conversion tests live in `packages/shared`.
- **Dev-proxy parity fix**: Vite now forwards `/s/` `/f/` `/health` like prod Caddy, so minted short links bounce through the OG page in dev (`2dc6e9f`). Gotcha: Vite proxy keys are raw prefixes — they must be slash-terminated (`'/s/'` not `'/s'`), or `/src/*` modules and `/favicon.svg` get proxied to Fastify and the dev app renders blank.
- **Gotchas earned**:
  - better-auth returns 403 on auth POSTs that carry a session cookie but no `Origin` header (CSRF check) — browsers always send it; curl/scripted tests must too.
  - React Compiler lint: RHF `watch()` → use `useWatch`; dnd-kit's `useSortable` return must be destructured; no `Date.now()` in render-scoped closures (wrap in module-level helpers, see `restTimer.ts`).
  - Registry components arrive light-first — the theme relies on `<html class="dark">` + `:root` carrying dark tokens; `shadcn add` prompts to overwrite customized files (button carries custom `xl`/`workout` sizes — never overwrite it blind).
  - recharts and the builder (dnd-kit) are code-split (`React.lazy` / route `lazy`); main bundle ~240 kB gz.
- **API gaps flagged for a future backend pass** (worked around in UI): no visibility edit for non-`planned` workouts (ADR-0003 makes `workouts.update` planned-only) — detail shows a static badge; no pre-accept friend-link resolve — the `/friend/:token` consent screen uses generic copy instead of the inviter's name; per-row volume isn't in `WorkoutSummary` — Log rows show sets/exercises instead.
- **Deferred per §2a** (recorded in MVP.md §1): friends feed, weekly goal + streak, account deletion. Password reset remains blocked on email infra (FRONTEND.md §3.14).
