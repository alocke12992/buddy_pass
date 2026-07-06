import { pgEnum } from 'drizzle-orm/pg-core';

// Values mirror packages/shared zod schemas (the app-layer contract) and, for
// exercise fields, the free-exercise-db source vocabulary (schema.json).

export const unitPreference = pgEnum('unit_preference', ['metric', 'imperial']);

/** Shared vocab: user experience AND exercise difficulty (same 3 levels). */
export const experienceLevel = pgEnum('experience_level', ['beginner', 'intermediate', 'expert']);

export const gender = pgEnum('gender', ['male', 'female', 'other']);

export const workoutStatus = pgEnum('workout_status', [
  'planned',
  'in_progress',
  'completed',
  'cancelled',
]);

export const workoutVisibility = pgEnum('workout_visibility', ['private', 'friends']);

export const exerciseForce = pgEnum('exercise_force', ['push', 'pull', 'static']);

export const exerciseMechanic = pgEnum('exercise_mechanic', ['compound', 'isolation']);

export const exerciseCategory = pgEnum('exercise_category', [
  'strength',
  'stretching',
  'cardio',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
  'plyometrics',
]);

export const muscleRole = pgEnum('muscle_role', ['primary', 'secondary']);

export const friendshipStatus = pgEnum('friendship_status', ['pending', 'accepted']);
