# Buddy Pass

"Multiplayer" workout tracking: create, share, and clone workouts with friends and compare progress. Single context.

## Language

### People & access

**Guest**:
A user on an anonymous session — full product access (clone, build, log) but cannot mint links. Purged after 90 days of inactivity.
_Avoid_: anonymous user, visitor

**Registered user**:
A user with a real (non-anonymous) account. Only registered users can mint share links and friend links.

**Friend**:
A user connected via a mutual, accepted friendship — always established by opening a friend link. "Buddy" is brand voice (app name, UI copy), not a distinct concept.
_Avoid_: follower, connection

**Visibility**:
A per-workout setting (`private` | `friends`) controlling who can see it. Derived stats respect it — numbers computed for a friend never include private workouts.

### Links

**Friend link**:
A revocable token a registered user mints; opening it creates an instant mutual friendship.
_Avoid_: friend request, invite (reserved for future directed workout invites)

**Share link**:
A revocable token granting read-and-clone access to one workout, regardless of its visibility. Its `use_count` counts clones, not views.

### Workouts

**Workout**:
A named, ordered plan of exercises with sets, owned by one user, moving through `planned → in_progress → completed | cancelled`. Structure freezes at start; only sets change mid-workout.

**Clone**:
A copy of a workout's structure under a new owner, linked to its source via the origin chain. Completion state is never copied; visibility resets to the cloner's default.
_Avoid_: fork, copy, duplicate

**Origin workout**:
The workout a clone was copied from (`origin_workout_id`). "Clones of X" is a query on this chain, never a stored list.

**Superset**:
A group of exercises within a workout performed back-to-back, marked by a shared group id.

**Warm-up set**:
A set flagged `is_warmup`; excluded from volume and all derived stats.

### Measurement

**Weigh-in**:
One body-weight measurement at a point in time. "Current weight" is always the latest weigh-in, never a stored field.
_Avoid_: weight entry, body measurement (the table name, not the term)

**Volume**:
Σ (reps × weight in kg) over completed, non-warm-up sets of completed workouts. The core progress metric.
_Avoid_: tonnage, total weight lifted
