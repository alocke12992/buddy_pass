import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { workoutStatus, workoutVisibility } from './enums';
import { exercises } from './exercises';
import { id, timestamps } from './helpers';

export const workouts = pgTable(
  'workouts',
  {
    id: id(),
    ownerId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: workoutStatus().notNull().default('planned'),
    visibility: workoutVisibility().notNull().default('private'),
    scheduledFor: timestamp({ withTimezone: true }),
    startedAt: timestamp({ withTimezone: true }),
    // duration = ended_at - started_at (never stored)
    endedAt: timestamp({ withTimezone: true }),
    notes: text(),
    /** Immediate parent if cloned; "clones of X" = WHERE origin_workout_id = X. */
    originWorkoutId: uuid().references((): AnyPgColumn => workouts.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index().on(t.ownerId, t.status), index().on(t.originWorkoutId)],
);

export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: id(),
    workoutId: uuid()
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    /** Ordering within the workout; app-maintained (no unique constraint so drag-reorder can shuffle freely). */
    position: integer().notNull(),
    /** Exercises sharing a super_set_id form a superset; no FK — it's a grouping token. */
    superSetId: uuid(),
    ...timestamps,
  },
  (t) => [index().on(t.workoutId, t.position)],
);

export const workoutSets = pgTable(
  'workout_sets',
  {
    id: id(),
    workoutExerciseId: uuid()
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    isWarmup: boolean().notNull().default(false),
    reps: integer().notNull(),
    /** Canonical kg (plans/MVP.md §2); converted for display only. */
    weightKg: numeric({ precision: 6, scale: 2, mode: 'number' }),
    restSeconds: integer().notNull().default(90),
    /** null = not done; doubles as the completion timestamp. */
    completedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.workoutExerciseId, t.position)],
);
