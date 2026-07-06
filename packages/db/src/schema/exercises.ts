import { index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import {
  exerciseCategory,
  exerciseForce,
  exerciseMechanic,
  experienceLevel,
  muscleRole,
} from './enums';
import { id, timestamps } from './helpers';

// Seeded from free-exercise-db (data/exercises.json, commit-pinned) — read-only to users.

export const equipments = pgTable('equipments', {
  id: id(),
  name: text().notNull().unique(),
  type: text().notNull(),
  photo: text(),
  description: text(),
  ...timestamps,
});

export const muscleGroups = pgTable('muscle_groups', {
  id: id(),
  name: text().notNull().unique(),
  description: text(),
  ...timestamps,
});

export const exercises = pgTable(
  'exercises',
  {
    id: id(),
    /** Source id from free-exercise-db, e.g. "Alternate_Incline_Dumbbell_Curl". */
    slug: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    category: exerciseCategory().notNull(),
    force: exerciseForce(),
    mechanic: exerciseMechanic(),
    level: experienceLevel().notNull(),
    instructions: jsonb().$type<string[]>().notNull().default([]),
    /** Relative paths; base URL comes from env (IMAGE_BASE_URL). */
    images: jsonb().$type<string[]>().notNull().default([]),
    equipmentId: uuid().references(() => equipments.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [index().on(t.level), index().on(t.category), index().on(t.equipmentId)],
);

export const exerciseMuscles = pgTable(
  'exercise_muscles',
  {
    id: id(),
    exerciseId: uuid()
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleGroupId: uuid()
      .notNull()
      .references(() => muscleGroups.id, { onDelete: 'cascade' }),
    role: muscleRole().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.exerciseId, t.muscleGroupId, t.role), index().on(t.muscleGroupId)],
);
