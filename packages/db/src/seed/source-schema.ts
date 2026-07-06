import { z } from 'zod';
import { EQUIPMENT_NAMES, EXERCISE_CATEGORIES, MUSCLE_GROUP_NAMES } from './vocab';

/** Contract for the vendored free-exercise-db JSON — fails loudly on vocab drift. */
export const sourceExerciseSchema = z.object({
  id: z.string().regex(/^[0-9a-zA-Z_-]+$/),
  name: z.string().min(1),
  force: z.enum(['push', 'pull', 'static']).nullable(),
  level: z.enum(['beginner', 'intermediate', 'expert']),
  mechanic: z.enum(['compound', 'isolation']).nullable(),
  equipment: z.enum(EQUIPMENT_NAMES).nullable(),
  primaryMuscles: z.array(z.enum(MUSCLE_GROUP_NAMES)),
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUP_NAMES)),
  instructions: z.array(z.string()),
  category: z.enum(EXERCISE_CATEGORIES),
  images: z.array(z.string()),
});

export type SourceExercise = z.infer<typeof sourceExerciseSchema>;

export const sourceFileSchema = z.array(sourceExerciseSchema);
