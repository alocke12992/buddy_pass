import { describe, expect, it } from 'vitest';
import {
  cloneWorkoutInputSchema,
  completeOnboardingInputSchema,
  linkTokenSchema,
  paginationInputSchema,
  userStatsInputSchema,
  volumeOverTimeInputSchema,
  workoutInputSchema,
  workoutSetInputSchema,
} from './api';

const uuid = (n: number) => `0192f0a0-0000-7000-8000-00000000000${n}`;

describe('linkTokenSchema', () => {
  it('trims surrounding whitespace off a pasted token', () => {
    expect(linkTokenSchema.parse('  demoshare123  ')).toBe('demoshare123');
  });

  it('rejects tokens outside 6–64 characters', () => {
    expect(linkTokenSchema.safeParse('abcde').success).toBe(false);
    expect(linkTokenSchema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(linkTokenSchema.safeParse('a'.repeat(65)).success).toBe(false);
  });
});

describe('paginationInputSchema', () => {
  it('defaults to a 20-item page with no cursor', () => {
    expect(paginationInputSchema.parse({})).toEqual({ limit: 20 });
  });

  it('caps the page size and demands a whole number', () => {
    expect(paginationInputSchema.safeParse({ limit: 100 }).success).toBe(true);
    expect(paginationInputSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(paginationInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(paginationInputSchema.safeParse({ limit: 1.5 }).success).toBe(false);
  });

  it('only accepts a uuid cursor', () => {
    expect(paginationInputSchema.safeParse({ cursor: uuid(1) }).success).toBe(true);
    expect(paginationInputSchema.safeParse({ cursor: 'newest' }).success).toBe(false);
  });
});

describe('workoutSetInputSchema', () => {
  it('fills in the working-set defaults', () => {
    expect(workoutSetInputSchema.parse({ position: 0, reps: 8, weightKg: 60 })).toEqual({
      position: 0,
      isWarmup: false,
      reps: 8,
      weightKg: 60,
      restSeconds: 90,
    });
  });

  it('keeps reps, weight, and rest inside storable bounds', () => {
    const set = { position: 0, reps: 8, weightKg: 60 };
    expect(workoutSetInputSchema.safeParse({ ...set, reps: -1 }).success).toBe(false);
    expect(workoutSetInputSchema.safeParse({ ...set, weightKg: -1 }).success).toBe(false);
    expect(workoutSetInputSchema.safeParse({ ...set, weightKg: 2_001 }).success).toBe(false);
    expect(workoutSetInputSchema.safeParse({ ...set, restSeconds: 3_601 }).success).toBe(false);
    expect(workoutSetInputSchema.safeParse({ ...set, position: -1 }).success).toBe(false);
  });
});

describe('workoutInputSchema', () => {
  const exercise = { exerciseId: uuid(1), position: 0, sets: [] };

  it('trims the name and leaves the server to fill visibility', () => {
    const parsed = workoutInputSchema.parse({ name: '  Push Day  ', exercises: [exercise] });
    expect(parsed.name).toBe('Push Day');
    expect(parsed.visibility).toBeUndefined();
  });

  it('rejects a blank name', () => {
    expect(workoutInputSchema.safeParse({ name: '   ', exercises: [] }).success).toBe(false);
  });

  it('rejects an exercise id that is not a uuid', () => {
    const bad = { ...exercise, exerciseId: 'barbell-squat' };
    const result = workoutInputSchema.safeParse({ name: 'Push Day', exercises: [bad] });
    expect(result.success).toBe(false);
  });

  it('caps a workout at 50 exercises', () => {
    const exercises = Array.from({ length: 51 }, (_, i) => ({ ...exercise, position: i }));
    expect(workoutInputSchema.safeParse({ name: 'Marathon', exercises }).success).toBe(false);
  });
});

describe('cloneWorkoutInputSchema', () => {
  const accepts = (source: unknown) => cloneWorkoutInputSchema.safeParse({ source }).success;

  it('accepts either a share token or a workout id as the source', () => {
    expect(accepts({ token: 'demoshare123' })).toBe(true);
    expect(accepts({ workoutId: uuid(1) })).toBe(true);
    expect(accepts({})).toBe(false);
  });
});

describe('userStatsInputSchema', () => {
  const stats = { heightCm: 178, gender: 'male' as const, dateOfBirth: new Date('1990-05-02') };

  it('insists the date of birth is in the past', () => {
    const future = new Date(Date.now() + 86_400_000);
    const result = userStatsInputSchema.safeParse({ ...stats, dateOfBirth: future });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('date of birth must be in the past');
    }
  });

  it('keeps height a whole number of centimetres within human range', () => {
    expect(userStatsInputSchema.safeParse(stats).success).toBe(true);
    expect(userStatsInputSchema.safeParse({ ...stats, heightCm: 178.5 }).success).toBe(false);
    expect(userStatsInputSchema.safeParse({ ...stats, heightCm: 49 }).success).toBe(false);
    expect(userStatsInputSchema.safeParse({ ...stats, heightCm: 261 }).success).toBe(false);
  });
});

describe('completeOnboardingInputSchema', () => {
  const input = {
    stats: { heightCm: 178, gender: 'female' as const, dateOfBirth: new Date('1994-01-09') },
    settings: {
      unitPreference: 'imperial' as const,
      experienceLevel: 'beginner' as const,
      defaultWorkoutVisibility: 'friends' as const,
    },
    weightKg: 68,
  };

  it('needs stats, settings, and a first weigh-in together', () => {
    expect(completeOnboardingInputSchema.safeParse(input).success).toBe(true);
    const noWeighIn = { stats: input.stats, settings: input.settings };
    expect(completeOnboardingInputSchema.safeParse(noWeighIn).success).toBe(false);
  });

  it('rejects implausible body weights', () => {
    const accepts = (weightKg: number) =>
      completeOnboardingInputSchema.safeParse({ ...input, weightKg }).success;
    expect(accepts(20)).toBe(true);
    expect(accepts(19)).toBe(false);
    expect(accepts(501)).toBe(false);
  });
});

describe('volumeOverTimeInputSchema', () => {
  it('requires a known bucket and leaves the range open-ended', () => {
    expect(volumeOverTimeInputSchema.parse({ bucket: 'week' })).toEqual({ bucket: 'week' });
    expect(volumeOverTimeInputSchema.safeParse({ bucket: 'quarter' }).success).toBe(false);
    expect(volumeOverTimeInputSchema.safeParse({}).success).toBe(false);
  });
});
