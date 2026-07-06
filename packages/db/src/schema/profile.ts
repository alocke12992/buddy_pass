import { date, index, integer, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { experienceLevel, gender, unitPreference, workoutVisibility } from './enums';
import { id, timestamps } from './helpers';

export const userStats = pgTable('user_stats', {
  id: id(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  heightCm: integer(),
  gender: gender(),
  // age is always computed from DOB — never stored (plans/MVP.md §4)
  dateOfBirth: date(),
  ...timestamps,
});

export const bodyMeasurements = pgTable(
  'body_measurements',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    weightKg: numeric({ precision: 6, scale: 2, mode: 'number' }).notNull(),
    measuredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
    // "current weight" = latest row; future body measurements (body_fat_pct,
    // waist_cm, ...) arrive as additive nullable columns
  },
  (t) => [index().on(t.userId, t.measuredAt.desc())],
);

export const userSettings = pgTable('user_settings', {
  id: id(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  unitPreference: unitPreference().notNull().default('metric'),
  // null = onboarding hasn't collected it yet
  experienceLevel: experienceLevel(),
  defaultWorkoutVisibility: workoutVisibility().notNull().default('private'),
  // generation fields (goal, cadence, variability, duration) arrive with fast-follow #1
  ...timestamps,
});
