import { z } from 'zod';

export const unitPreferenceSchema = z.enum(['metric', 'imperial']);
export type UnitPreference = z.infer<typeof unitPreferenceSchema>;

export const experienceLevelSchema = z.enum(['beginner', 'intermediate', 'expert']);
export type ExperienceLevel = z.infer<typeof experienceLevelSchema>;

export const workoutVisibilitySchema = z.enum(['private', 'friends']);
export type WorkoutVisibility = z.infer<typeof workoutVisibilitySchema>;

export const workoutStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'cancelled']);
export type WorkoutStatus = z.infer<typeof workoutStatusSchema>;

export const genderSchema = z.enum(['male', 'female', 'other']);
export type Gender = z.infer<typeof genderSchema>;
