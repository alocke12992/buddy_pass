import { z } from 'zod';
import {
  experienceLevelSchema,
  genderSchema,
  unitPreferenceSchema,
  workoutStatusSchema,
  workoutVisibilitySchema,
} from './schemas';

// tRPC input contracts (plans/API.md). Weights kg canonical; dates cross the
// wire as Date via superjson; ids are UUIDv7; `position` (not `order`) matches
// the DB columns end-to-end.

export const linkTokenSchema = z.string().trim().min(6).max(64);

/** Cursor pagination on UUIDv7 ids (plans/API.md §1): shaped for useInfiniteQuery. */
export const paginationInputSchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const workoutSetInputSchema = z.object({
  position: z.number().int().min(0),
  isWarmup: z.boolean().default(false),
  reps: z.number().int().min(0).max(10_000),
  weightKg: z.number().min(0).max(2_000),
  restSeconds: z.number().int().min(0).max(3_600).default(90),
});

export const workoutExerciseInputSchema = z.object({
  exerciseId: z.uuid(),
  position: z.number().int().min(0),
  /** Client-generated uuid; exercises sharing one form a superset. */
  superSetId: z.uuid().optional(),
  sets: z.array(workoutSetInputSchema).max(100),
});

export const workoutInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(10_000).optional(),
  scheduledFor: z.date().optional(),
  /** Omitted → server fills from user_settings.default_workout_visibility. */
  visibility: workoutVisibilitySchema.optional(),
  exercises: z.array(workoutExerciseInputSchema).max(50),
});
export type WorkoutInput = z.infer<typeof workoutInputSchema>;

export const workoutListInputSchema = paginationInputSchema.extend({
  ownerId: z.uuid().optional(),
  status: workoutStatusSchema.optional(),
});

export const cloneWorkoutInputSchema = z.object({
  source: z.union([z.object({ token: linkTokenSchema }), z.object({ workoutId: z.uuid() })]),
});

export const userStatsInputSchema = z.object({
  heightCm: z.number().int().min(50).max(260),
  gender: genderSchema,
  // age is always computed from DOB — never stored or sent as a field
  dateOfBirth: z.date().refine((d) => d < new Date(), 'date of birth must be in the past'),
});
export type UserStatsInput = z.infer<typeof userStatsInputSchema>;

export const userSettingsInputSchema = z.object({
  unitPreference: unitPreferenceSchema,
  experienceLevel: experienceLevelSchema,
  defaultWorkoutVisibility: workoutVisibilitySchema,
});
export type UserSettingsInput = z.infer<typeof userSettingsInputSchema>;

export const bodyWeightSchema = z.number().min(20).max(500);

/** One transaction: user_stats + user_settings + first weigh-in. Partial onboarding cannot exist. */
export const completeOnboardingInputSchema = z.object({
  stats: userStatsInputSchema,
  settings: userSettingsInputSchema,
  weightKg: bodyWeightSchema,
});

export const logWeightInputSchema = z.object({
  weightKg: bodyWeightSchema,
  measuredAt: z.date().optional(),
});

export const statsBucketSchema = z.enum(['day', 'week', 'month']);
export type StatsBucket = z.infer<typeof statsBucketSchema>;

export const dateRangeInputSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
});

export const volumeOverTimeInputSchema = dateRangeInputSchema.extend({
  userId: z.uuid().optional(),
  bucket: statsBucketSchema,
});
