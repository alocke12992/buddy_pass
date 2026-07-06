# Buddy Pass — AI Enablement (Idea Catalog)

> Companion to `plans/MVP.md`. This is a **brainstorm catalog**, not a committed roadmap — ideas to react to, prune, and prioritize later. Nothing here changes the MVP cut line.

**Assumptions**

- **Backend:** AWS Bedrock (per MVP.md infra: EC2/RDS/S3, IAM instance role gets `bedrock:InvokeModel`). Model choice per-feature — cheap/fast models for classification and short text, stronger models for planning/agent loops.
- **Interface discipline:** MVP.md §8 already mandates generation as a pure function in `packages/shared` (`profile + history + constraints → workout plan`) with rule-based and Bedrock-backed implementations swappable. Every idea below should hide behind a similar seam — the app consumes a capability, never a model.
- **Data is the moat:** the MVP schema already captures everything the AI needs — set-level logs with timestamps, exercise `force`/`mechanic`/`level`, muscle roles, DOB/gender/height, weight history. Most ideas below are _readers_ of this data, not new tables.

**What "agentic" means here:** not a chatbot bolted on. An agent **observes** (your training history), **decides** (against your goals), and **acts** (adjusts your next workout, nudges you, drafts a challenge) — with the user approving anything that changes their plan. One-shot LLM calls (e.g. "summarize my week") are included but marked as such; the compounding value is in the loops.

---

## 1. The Coach — a persistent training agent

The flagship concept most other ideas hang off. A per-user agent that owns the question _"what should this person do next, and is what they're doing working?"_

| #   | Idea                                   | What it does                                                                                                                                                                                                                                                                                 | Agentic loop                                                                       | Value | Effort                         |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- | ------------------------------ |
| 1.1 | **AI workout generation**              | Bedrock-backed implementation of the generation interface (fast-follow #1). Goal + cadence + experience + equipment + recovery → complete workout with sets/reps/weights derived from _your actual logged history_, not population tables.                                                   | One-shot, but improves as history accrues                                          | ★★★   | M — interface already designed |
| 1.2 | **Progressive overload engine**        | After each completed workout, the agent reviews performance (completed vs planned reps/weight, RPE when available) and writes the _next_ session's targets: bump weight, add a rep, or deload. The INIT.md "How was it" feature (`reps_in_reserve`) is this agent's calibration signal.      | Observe → decide → adjust next plan; runs after every workout                      | ★★★   | M                              |
| 1.3 | **Recovery-aware scheduling**          | Derive per-muscle recovery from workout history (MVP.md already plans deriving `user_recovery` from `workout_sets → workout_exercises → exercise_muscles`). Agent uses it to pick what to train today, warn "hamstrings hit 20h ago," and reshape a planned workout if you trained off-plan. | Continuous state the agent maintains and consults                                  | ★★★   | M — query exists in plan       |
| 1.4 | **Plateau detection & program pivots** | Watch volume/e1RM trends per lift. When progress stalls for N weeks, the agent diagnoses (volume? frequency? recovery? exercise selection?) and proposes a concrete program change with reasoning.                                                                                           | Weekly background job → proposal → user accepts/rejects → agent learns from choice | ★★☆   | M/L                            |
| 1.5 | **Clone-time personalization**         | When a friend's workout is cloned (the growth loop!), regenerate sets/weights for the _cloner's_ profile and history while keeping the exercise structure. Already flagged in MVP.md §5 as arriving with generation — Bedrock version handles sparse-history cases (guests!) gracefully.     | One-shot at clone; ties AI directly to the viral loop                              | ★★★   | S — once 1.1 exists            |
| 1.6 | **Goal check-ins**                     | Periodic conversational check-in: "You said build muscle — you're averaging 1.8 sessions/week against a 3-day plan. Want a 2-day version instead?" Agent renegotiates the plan against reality instead of letting users silently churn.                                                      | Scheduled loop; retention play                                                     | ★★☆   | M                              |

## 2. In-workout agent — live session copilot

The design system's target moment: sweaty hands, 2-second glances. AI here must be **low-latency, interruptible, and optional**.

| #   | Idea                        | What it does                                                                                                                                                                                                                                                      | Value | Effort |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| 2.1 | **Smart exercise swap**     | "Bench is taken" → one tap suggests equivalents matched on muscle roles + `force`/`mechanic` + your equipment, with weights translated from your history on the substitute (or estimated from ratios). Rule-based candidate list, LLM ranking/weight-translation. | ★★★   | S/M    |
| 2.2 | **Mid-set autoregulation**  | You logged 6 reps against a planned 10 → agent immediately proposes adjusted remaining sets (drop weight, adjust reps) instead of letting the plan go stale mid-session.                                                                                          | ★★★   | M      |
| 2.3 | **Voice logging**           | "Two twenty-five for eight" → parsed and logged hands-free. Speech-to-text on device, cheap LLM (or grammar) for parsing into `workout_sets`. Huge mid-workout UX win; also the natural input channel for 2.1/2.2.                                                | ★★☆   | M/L    |
| 2.4 | **Form & how-to on demand** | Tap an exercise mid-workout → condensed cues generated from the library's `instructions` jsonb, adapted to experience level ("beginner: think about X"). Cacheable per (exercise, level) — near-zero marginal cost.                                               | ★☆☆   | S      |
| 2.5 | **Rest-timer coaching**     | Rest recommendations that react to the session: heavier compound + missed reps → "take the full 3 min"; supersets → shorter. Mostly rules; LLM only for phrasing.                                                                                                 | ★☆☆   | S      |

## 3. Insights & recaps — make the data talk

Mostly one-shot generation over aggregates. Cheap, high perceived value, low risk — likely the best **first** shippable AI surface.

| #   | Idea                                      | What it does                                                                                                                                                                                                                                       | Value | Effort |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| 3.1 | **Weekly recap**                          | Narrative summary: volume vs last week, PRs, most-trained muscles, neglected ones, streak status. Rendered as a shareable card (feeds the growth loop).                                                                                            | ★★★   | S      |
| 3.2 | **Ask your history**                      | Natural-language Q&A: "When did I last squat over 100kg?" "Is my bench actually going up?" LLM → SQL/tRPC tool calls over the user's own data → grounded answer with a chart. A contained, genuinely useful agent (tool-use loop, bounded domain). | ★★☆   | M      |
| 3.3 | **PR & milestone detection with context** | Not just "new PR!" but "first time pulling 2× bodyweight" or "10 sessions in 30 days — your best month." Rules find candidates; LLM writes the moment. Pairs with the design system's one-shot volt celebration.                                   | ★★☆   | S      |
| 3.4 | **Imbalance & blind-spot audit**          | Periodic scan of push:pull ratio, left/right unilateral gaps, never-trained muscle groups → gentle audit with suggested fixes wired into the generator (1.1).                                                                                      | ★★☆   | S/M    |
| 3.5 | **Onboarding history import**             | Paste/photo of an old spreadsheet or notes-app log → LLM extracts structured history into `workouts`/`workout_sets`. Kills the cold-start problem for every other feature in this doc.                                                             | ★★☆   | M      |

## 4. Social & multiplayer AI — the "buddy" in Buddy Pass

Differentiated territory: every other app has an AI coach; none have AI woven into _multiplayer_ fitness.

| #   | Idea                                | What it does                                                                                                                                                                                                                                   | Value | Effort                    |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------- |
| 4.1 | **Challenge referee**               | For fast-follow #3 (challenges): agent designs the _normalized_ scoring INIT.md wants ("stronger friend shouldn't auto-win") — handicaps from each participant's baseline, %-progress scoring, weekly standings with commentary.               | ★★★   | M                         |
| 4.2 | **Buddy recap / trash-talk digest** | Weekly friend-group digest: who trained most, whose squat is climbing, head-to-head trends — computed **only from friends-visible workouts** (MVP privacy rule extends to all derived AI output). Tone configurable: encouraging ↔ trash-talk. | ★★☆   | S                         |
| 4.3 | **Sync-mode hype & handicap**       | In live multiplayer: AI equalizes the _session_ (each user's sets scaled to their own profile so a mixed-strength pair "races" fairly) and provides light commentary on buddy activity (violet moments).                                       | ★★☆   | M — needs sync mode first |
| 4.4 | **Workout matchmaking**             | "You and Jake both have upper-body queued and are both free-ish at 6pm" → nudge to sync up. Later: suggest compatible workout structures for shared sessions.                                                                                  | ★☆☆   | M/L                       |
| 4.5 | **Group program generator**         | One prompt → a shared multi-week program where the _structure_ is common (everyone does the same split, comparable) but loads are personalized per member (1.5 applied group-wide). The strongest social-AI fusion of the share/clone loop.    | ★★★   | L                         |

## 5. Platform enablers (build once, every feature uses it)

- **`packages/ai`** — the seam. Typed capability interfaces (`generateWorkout`, `summarizeWeek`, `suggestSwap`, …), a Bedrock client behind them, Zod-validated structured outputs (reject/retry on schema miss), prompt templates versioned in-repo. Feature code never sees a prompt or model id.
- **User context assembler** — one function that builds the model-facing view of a user: profile, goals, recent sessions, e1RM trends, recovery state, equipment. Every capability consumes it; it's also the unit to test/redact/cache.
- **Structured outputs only** — anything that writes to the plan (generation, overload, swaps) returns schema-validated JSON mapped to real `exercise_id`s. The model proposes; deterministic code validates against the library and the user's gym before anything persists.
- **Cost & latency budget** — recaps/insights are async jobs (cheap model, cached); in-workout features must respond < ~2s or fall back to rules. The rule-based generator (fast-follow #1) doubles as the permanent degraded-mode fallback when Bedrock is slow/down/over-budget.
- **Evals before vibes** — a small golden set of user contexts with expected-property assertions on generated plans (no muscle trained on <48h recovery unless intended, weights within ±15% of history, duration within bounds). Runs in CI against prompt changes.

## 6. Cross-cutting concerns

- **Trust & safety.** Fitness advice has injury risk. Guardrails: weight increases capped per step (e.g. ≤10%), deload suggestions favored on missed-rep patterns, no medical claims, experience-level-appropriate exercise selection (`level` field exists for this). The agent _proposes_, the user _confirms_ — nothing rewrites a plan silently.
- **Privacy.** The MVP invariant — derived numbers never leak private workouts — must hold for every AI output. Buddy digests, matchmaking, and challenge commentary read only friends-visible data. User context sent to Bedrock is scoped to the requesting user (+ explicitly shared friend data), never the whole graph.
- **Personality & design.** The design system is settled: volt = you, violet = buddies. The Coach needs a decided identity — recommendation: the Coach is **not a buddy**; it speaks through neutral/`--info` surfaces and standard UI, no third accent color, no anthropomorphized avatar in v1. Revisit only if a persona proves valuable.
- **Cold start.** Ideas ranked ★★★ mostly need history. Day-one users get: profile-based generation (1.1 degrades to population estimates), history import (3.5), and clone personalization (1.5). Sequence accordingly.

## 7. Suggested first bets (when prioritization happens)

Not a commitment — but if the catalog were cut today:

1. **1.1 + 1.5 Generation & clone personalization** — already the planned fast-follow; clone personalization welds AI to the growth loop.
2. **3.1 Weekly recap** — cheapest real AI value; shareable artifact; exercises the `packages/ai` seam end-to-end with low risk.
3. **1.2 + 1.3 Overload + recovery** — turns generation into a _coach_; this is the retention engine and the genuinely agentic core.
4. **2.1 Smart swap** — highest-value in-workout moment, small scope.
5. **4.1 Challenge referee** — lands with the challenges fast-follow and is the most defensible social-AI differentiator.

## 8. Open questions

1. Which Bedrock models? (Claude family for planning/agent loops, Haiku-class for parsing/recaps — needs a cost model per feature.)
2. Is the Coach visible as a _place_ in the app (a tab/feed of proposals) or ambient (inline suggestions where they apply)?
3. Do agent proposals need an audit trail table (`agent_actions`: proposal, reasoning, accepted/rejected) — for UX ("why?"), evals, and calibration? Likely yes; schema is additive.
4. How much does voice logging (2.3) matter vs. faster tap UX? Needs a prototype, not a debate.
5. Free vs. paid: do AI features become the monetization line, and does that change which ones ship first?
