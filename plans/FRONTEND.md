# Buddy Pass — Frontend Plan

> Refined via grilling session on 2026-07-06. Companion to `MVP.md` (backend/data/infra source of truth). This document covers UX flows, the screen inventory, and the navigation/route map for the MVP web app (`apps/web`). Visual language is owned by `docs/design-system.md`; component architecture is decided at implementation time.

**Scope of this document:** flows (entry points, steps, exits, edge states) + screens (purpose, key elements, empty/loading/error states) + route map. Nothing else.

---

## 1. MVP.md Deltas

Two additions surfaced during frontend planning; record them back into the schema work (Phase 1–2):

1. **`user_settings.weekly_workout_goal`** — nullable int (target workouts per week). Set in onboarding (skippable), editable in Settings. Powers the Log tab's goal ring.
2. **Streak** — defined as *consecutive weeks in which the weekly goal was met*. Always derived from completed-workout history + the goal; never stored. No goal set → no streak shown.

> **Deferred post-MVP (2026-07-07, web implementation planning — see MVP.md §1 "Out"):** both deltas ship later. Until then the Log tab's stats row shows this-week count + total completed (no ring, no streak), and Settings/onboarding omit the goal field.

---

## 2. Navigation Map

**Bottom tab bar, 4 tabs** (mobile-first; becomes a sidebar ≥1024px with the same destinations):

| Tab | Route | Purpose |
|---|---|---|
| **Home** | `/` | Launcher: the next workout, one tap from starting |
| **Log** | `/log` | Time view: calendar, goal/streak, history |
| **Friends** | `/friends` | Feed of buddies' completed workouts, invites |
| **Profile** | `/profile` | You: stats, charts, weigh-ins, settings |

**Outside the tabs:**

| Route | Screen |
|---|---|
| `/workout/new` | Workout builder (full-screen flow) |
| `/workout/:id` | Workout detail (read-only; own or friend's, visibility-gated) |
| `/workout/:id/edit` | Builder in edit mode (planned workouts only) |
| `/workout/:id/live` | Active logging (full-screen takeover, no tab bar) |
| `/workout/:id/summary` | Post-workout summary |
| `/share/:token` | Share landing (public; minted short links hit the api's `/s/:token`, which serves OG meta and bounces humans here) |
| `/friend/:token` | Friend link landing (public; minted `/f/:token` links redirect here) |
| `/welcome`, `/sign-in`, `/sign-up` | Auth (logged-out only) |
| `/onboarding` | Post-signup wizard |
| `/settings` | Settings (sub-screen of Profile) |

**Global rules:**
- An `in_progress` workout shows a persistent **resume banner** (volt, pulsing dot) above the tab bar on every tabbed screen; tapping it returns to `/workout/:id/live`.
- Guests (anonymous sessions) see all four tabs with no restrictions; signup CTAs appear at the finish summary and on Profile.
- Design system rules apply throughout: volt = you, violet = buddies; `tabular-nums` on all numbers; 56px targets for mid-workout controls; primary in-workout actions in the bottom third.

---

## 3. Screens

### 3.1 Home (`/`)

The launcher. Exactly one hero card — no lists.

- **Hero card priority:** ① in-progress workout (Resume) → ② next planned workout by `scheduled_for`, then most recently created planned (Start) → ③ empty state.
- Hero card shows: workout name, exercise count, est. sets/volume, schedule chip if scheduled, origin attribution if cloned ("from Alex").
- **Actions:** `Start` (primary, volt) · `Reschedule` (moves `scheduled_for`; lightweight date sheet) · `Edit` (→ builder edit mode).
- **Header:** `+ New workout` → `/workout/new`.
- **Empty state:** "No workout planned" + `Create a workout` (→ builder) as the hero CTA.
- **Loading:** skeleton hero card. **Error:** inline retry card.

### 3.2 Workout Builder (`/workout/new`, `/workout/:id/edit`)

Single-screen editor. The exercise library is *not* a standalone destination in MVP — it exists only as the picker inside the builder.

- **Layout:** name field at top; ordered exercise list; each exercise expands to its set rows (reps, weight, rest); `+ Add exercise` opens the picker.
- **Picker (full-screen sheet):** search by name; filters for muscle group, equipment, level; results show image, name, primary muscles; tap to add (multi-add supported, sheet stays open). Exercise row tap → mini detail (instructions, images).
- **Sets:** add/duplicate/remove set rows; per-set reps / weight (displayed in the user's units, stored kg) / rest seconds; warm-up toggle.
- **Supersets:** "link with previous" control on an exercise row groups them (`super_set_id`); linked exercises render as one bracketed group; unlink to break.
- **Reorder:** drag handles on exercise rows.
- **Save sheet:** optional schedule date (`scheduled_for`), visibility (`private`/`friends`, defaulted from `user_settings.default_workout_visibility`) → creates `planned` workout → back to Home with it as the hero.
- **Edge states:** empty builder (no exercises yet → picker CTA); discard-changes confirmation on back; edit mode only for `planned` workouts.

### 3.3 Active Logging (`/workout/:id/live`)

The design target screen (design-system principle 1). Full-screen takeover, no tab bar.

- **Layout:** scrollable list of all exercises; each shows its set rows. Current set is visually dominant (display-size numerals). Superset groups render bracketed, sets interleaved in order.
- **Set row:** reps + weight steppers (56px targets), inline editable mid-workout; check to complete (`completed_at`) → volt check pop.
- **Sticky bottom bar:** rest timer (auto-starts from the completed set's `rest_seconds`; **not** auto-started on the last set of each exercise, per MVP.md) with skip/±15s; primary `Complete set` action; elapsed workout time.
- **Header:** workout name, elapsed timer, overflow menu → `Cancel workout` (confirmation; sets status `cancelled`).
- **Finish:** enabled always; if incomplete sets remain, confirm ("3 sets unfinished — finish anyway?"). Sets `completed` + `ended_at` → summary.
- **Leaving the screen** keeps the workout `in_progress` and shows the global resume banner.

### 3.4 Post-Workout Summary (`/workout/:id/summary`)

- Duration, total volume, sets completed, per-exercise breakdown; PR callouts (volt celebration, respecting `prefers-reduced-motion`).
- **Actions:** `Share` (primary → share sheet, §3.9) · `Done` (→ Home).
- **Guest:** signup CTA card ("Save your progress — create an account") below the stats.

### 3.5 Log (`/log`)

The time view: everything past and planned.

- **Calendar strip (top):** month view; volt dots on days with completed workouts, muted dots on future days with planned workouts. Selecting a day filters the list below; clear selection returns to full history.
- **Stats row:** weekly-goal ring (this week's completed / goal), current streak (consecutive goal-met weeks), total workouts completed. Goal unset → ring replaced by `Set a weekly goal` chip (→ Settings). *(Goal ring + streak deferred post-MVP per §1 — row shows this-week count + total until then.)*
- **List:** reverse-chronological workouts (completed + planned when a future day is selected); rows show name, date, duration, volume, status badge (per design-system status table).
- **Tap → Workout Detail** (§3.6).
- **Empty state:** no workouts yet → CTA to create first workout. **Loading:** skeleton rows.

### 3.6 Workout Detail (`/workout/:id`)

One read-only screen, three contexts:

- **Own completed/cancelled:** full sets/reps/weights, duration, volume, notes, origin attribution. **Actions:** `Repeat` (primary — clones into a new `planned` workout pre-filled with last time's structure and weights, `origin_workout_id` set; → Home hero) · `Share` (→ share sheet) · `Edit visibility`.
- **Own planned:** same view + `Start` · `Edit` · `Reschedule` · `Delete`.
- **Friend's (visibility=`friends`) or shared preview:** read-only, violet-accented owner attribution; **Action:** `Clone` (copies structure as-is per MVP.md; → own planned workout, → Home hero).
- **Error states:** not found / not visible → friendly "This workout isn't available" screen.

### 3.7 Friends (`/friends`)

- **Avatar row (top):** friends with fixed accent colors (assigned at accept time, per design system); tap → Friend Profile (§3.8). `+` avatar → invite sheet: generates/reuses `friend_links` token, copy link, revoke.
- **Feed:** friends' completed workouts (visibility=`friends`), reverse-chron: avatar (accent color), name, workout name, key stats (duration, volume), relative time. Tap → Workout Detail with `Clone`. *(Deferred post-MVP — needs a cross-friend `friends.feed` endpoint, see MVP.md §1. Until then the tab is the avatar row + invite CTA; buddies' workouts are browsed via Friend Profile §3.8.)*
- **Empty state (no friends):** the invite CTA is the hero — "Workouts are better with buddies" + `Invite a friend`.
- **Empty feed (friends but no visible activity):** quiet "No recent buddy workouts" note.

### 3.8 Friend Profile (`/friends/:id`)

- Header: avatar (accent color), name, friends-since.
- Their `friends`-visible workouts (list → Workout Detail + Clone) and basic stats computed **only from friends-visible workouts** (MVP.md privacy rule).
- Overflow: remove friend (confirmation).

### 3.9 Share Sheet (overlay, not a route)

Reached from Workout Detail and the Summary.

- One active `share_links` token per workout, reused across opens; `Copy link` primary; shows `use_count` ("Opened 4 times"); `Revoke link` (confirmation; next open generates a fresh token).
- Visibility reminder if the workout is `private` ("Anyone with the link can view this workout").

### 3.10 Share Landing (`/share/:token`)

The growth loop's front door. Backend serves OG meta (workout name, exercise count, owner if visible); SPA renders:

- Read-only workout preview (exercises, sets structure), owner attribution.
- **`Clone this workout`** (primary, volt): no session → silent anonymous guest session, then clone → land on **Home** with the clone as the hero card, ready to start. Existing session → same, minus guest creation.
- Signed-in header affordance for existing users ("Sign in" link, small).
- **Edge states:** revoked/invalid token → dead-link screen ("This link is no longer active") with a generic app CTA.

### 3.11 Friend Link Landing (`/friend/:token`)

The consent moment — never auto-accept (link prefetchers must not consume it).

- Confirmation screen: inviter avatar + name, "Add **Alex** as a buddy?" — explains mutual visibility in one line.
- **`Accept`** (violet): no session → silent guest session, then write mutual `accepted` friendship → Friends tab with the new friend highlighted. `Not now` → welcome/home.
- **Edge states:** revoked/invalid token → dead-link screen; already friends → "You're already buddies" → Friends tab.

### 3.12 Profile (`/profile`)

- **Header:** avatar, name; **guest:** prominent `Create account` card at top instead (merge-on-signup per MVP.md).
- **Stats block:** totals (workouts, volume, this-week count).
- **Charts:** volume-over-time; body weight over time (`body_measurements`) with `Log weigh-in` action (sheet: weight in display units).
- **Links:** `Settings` (§3.13) · `Sign out`.
- **Empty states:** charts need ≥2 data points; otherwise show a "log more to see trends" placeholder.

### 3.13 Settings (`/settings`)

- Units (`metric`/`imperial`), default workout visibility, weekly workout goal (nullable) *(goal deferred per §1)*, experience level.
- Body basics from onboarding editable here: height, DOB, gender.
- Account section: email, change password, sign out. Danger zone: delete account (confirmation) *(deferred — better-auth `deleteUser` not enabled yet, see MVP.md §1)*.

### 3.14 Auth & Onboarding

- **Welcome (`/welcome`):** logged-out root — one screen, value prop, `Create account` + `Sign in`. Guests arriving via `/s/`/`/f/` never see it unless they navigate here.
- **Sign in / Sign up (`/sign-in`, `/sign-up`):** email/password via better-auth; inline validation; guest sessions upgrading via sign-up trigger the merge (`onLinkAccount`).
- **Password reset:** screens are planned (request + reset forms) but **blocked on an email-infra decision** (no email provider in MVP.md — e.g. SES). Ship auth without it; do not build the UI until the dependency is resolved. Tracked as an open question, not silently dropped.
- **Onboarding (`/onboarding`):** 3-step post-signup wizard, guests exempt until they sign up:
  1. **Units** (required) + body basics: DOB, gender, height, current weight (first `body_measurements` row)
  2. **Experience level** (skippable)
  3. **Weekly goal + default visibility** (skippable) *(goal deferred per §1 — step collapses to default visibility)*
  - Skipped fields are settable later in Settings; progress dots; finishing → Home.

---

## 4. Flows (Entry → Steps → Exit)

### F1. First workout (new signed-up user)
Welcome → sign up → onboarding (3 steps) → Home (empty) → `Create a workout` → builder → add exercises via picker → configure sets/supersets → save (schedule + visibility) → Home hero → `Start` → logging → finish → summary → Home.

### F2. Daily logging (returning user)
Open app → Home hero (next planned) → `Start` → log sets, rest timer between → `Finish` → summary → `Done`. **Variants:** resume banner path (left mid-workout); `Reschedule` instead of start; cancel from overflow.

### F3. Repeat a past workout
Log → select day / scroll → workout detail → `Repeat` → new planned clone → Home hero → F2.

### F4. Share → guest clone → merge (the growth loop)
Owner: detail/summary → `Share` → copy link → sends it.
Recipient: opens `/s/:token` (OG preview in chat) → read-only preview → `Clone` → silent guest session → Home hero → logs workouts as guest (F2) → signup prompt at summary/Profile → sign up → guest data merges → onboarding.
**Edges:** revoked token → dead link; existing user → clone lands in their account directly.

### F5. Befriending
Inviter: Friends → `+` → invite sheet → copy `/f/:token` link → sends.
Opener: `/f/:token` → confirmation → `Accept` (guest session if logged out) → mutual friendship → Friends tab, new friend highlighted → feed shows their `friends`-visible completions.
**Edges:** revoked/invalid token; already friends.

### F6. Clone from the feed
Friends feed → buddy's workout → detail → `Clone` → planned copy → Home hero → F2. (Origin attribution shown on the clone.) *(Feed deferred per §3.7 — for MVP this flow starts from Friend Profile §3.8.)*

### F7. Weigh-in & progress check
Profile → `Log weigh-in` → new `body_measurements` row → chart updates. Log tab for goal ring/streak; Profile for trends.

---

## 5. Cross-Cutting States

- **Loading:** skeletons matching final layout (hero card, list rows, chart frames); no spinners on tabbed screens.
- **Errors:** inline retry cards per screen section; global toast for mutation failures; forms show field-level errors (React Hook Form + shared Zod schemas).
- **Empty states:** every screen defines one above; each pairs a one-liner with the single most useful CTA.
- **Offline/mid-workout resilience:** out of scope for this plan; logging mutations go through React Query defaults. Revisit if mid-workout flakiness shows up.
- **Desktop (≥1024px):** tabs → sidebar; workout flows capped at 640px width; Log and Profile may use the wider 1024px dashboard layout (per design system).

---

## 6. Open Questions (tracked, not blocking)

1. **Email infra** for password reset (SES?) — decides when reset screens get built.
2. **PR detection** for the summary celebration — needs a definition (heaviest weight per exercise? volume?) before Phase 4; if undecided, ship summary without PR callouts.
3. **"Save/modify hero workout for another day"** — covered minimally by `Reschedule` + `Edit`; anything richer (templates) is post-MVP.
