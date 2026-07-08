import { describe, expect, it } from 'vitest';
import type { ExerciseIndexEntry, WorkoutDoc } from '@/lib/api-types';
import {
  addExercise,
  addSet,
  builderFromDoc,
  builderToInput,
  emptyBuilder,
  linkWithPrevious,
  moveExercise,
  removeExercise,
  toggleExercise,
  unlinkFromSuperset,
} from './state';

const entry = (id: string): ExerciseIndexEntry => ({
  id,
  slug: id,
  name: `Exercise ${id}`,
  level: 'beginner',
  force: null,
  mechanic: null,
  category: 'strength',
  equipment: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  thumbnail: null,
});

function threeExercises() {
  let s = emptyBuilder();
  s = addExercise(s, entry('a'));
  s = addExercise(s, entry('b'));
  s = addExercise(s, entry('c'));
  return s;
}

describe('supersets', () => {
  it('linking with previous mints a shared group id', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key);
    expect(s.exercises[0]!.superSetId).not.toBeNull();
    expect(s.exercises[0]!.superSetId).toBe(s.exercises[1]!.superSetId);
    expect(s.exercises[2]!.superSetId).toBeNull();
  });

  it('linking a third exercise extends the same group', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key);
    s = linkWithPrevious(s, s.exercises[2]!.key);
    const ids = s.exercises.map((e) => e.superSetId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).not.toBeNull();
  });

  it('unlinking dissolves a two-exercise group entirely', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key);
    s = unlinkFromSuperset(s, s.exercises[1]!.key);
    expect(s.exercises.every((e) => e.superSetId === null)).toBe(true);
  });

  it('dragging a grouped exercise away splits the group cleanly', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key); // a+b grouped, c solo
    s = moveExercise(s, 2, 1); // c lands between a and b
    expect(s.exercises.map((e) => e.superSetId)).toEqual([null, null, null]);
  });

  it('removing one member of a pair dissolves the group', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key);
    s = removeExercise(s, s.exercises[0]!.key);
    expect(s.exercises.every((e) => e.superSetId === null)).toBe(true);
  });
});

describe('toggleExercise (picker taps)', () => {
  it('adds when absent, removes when present — never duplicates', () => {
    let s = emptyBuilder();
    s = toggleExercise(s, entry('a'));
    expect(s.exercises).toHaveLength(1);
    s = toggleExercise(s, entry('a'));
    expect(s.exercises).toHaveLength(0);
  });

  it('removing one member of a superset pair dissolves the group', () => {
    let s = threeExercises();
    s = linkWithPrevious(s, s.exercises[1]!.key);
    s = toggleExercise(s, entry('a'));
    expect(s.exercises.map((e) => e.exercise.id)).toEqual(['b', 'c']);
    expect(s.exercises.every((e) => e.superSetId === null)).toBe(true);
  });
});

describe('sets', () => {
  it('addSet copies the last set and never inherits warm-up', () => {
    let s = addExercise(emptyBuilder(), entry('a'));
    const key = s.exercises[0]!.key;
    s = {
      ...s,
      exercises: [
        {
          ...s.exercises[0]!,
          sets: [{ key: 'w', isWarmup: true, reps: 12, weightKg: 40, restSeconds: 60 }],
        },
      ],
    };
    s = addSet(s, key);
    const added = s.exercises[0]!.sets.at(-1)!;
    expect(added).toMatchObject({ reps: 12, weightKg: 40, restSeconds: 60, isWarmup: false });
  });
});

describe('doc round-trip', () => {
  it('doc → state → input preserves structure, supersets, and set numbers', () => {
    const doc = {
      id: 'w1',
      name: 'Push Day',
      status: 'planned',
      visibility: 'friends',
      scheduledFor: new Date('2026-07-10T00:00:00Z'),
      startedAt: null,
      endedAt: null,
      ownerId: 'u1',
      originWorkoutId: null,
      exerciseCount: 2,
      setCount: 3,
      notes: 'notes',
      exercises: [
        {
          id: 'we1',
          position: 0,
          superSetId: 'ss1',
          exercise: entry('a'),
          sets: [
            {
              id: 's1',
              position: 0,
              isWarmup: true,
              reps: 12,
              weightKg: 40,
              restSeconds: 60,
              completedAt: null,
            },
            {
              id: 's2',
              position: 1,
              isWarmup: false,
              reps: 8,
              weightKg: 60,
              restSeconds: 90,
              completedAt: null,
            },
          ],
        },
        {
          id: 'we2',
          position: 1,
          superSetId: 'ss1',
          exercise: entry('b'),
          sets: [
            {
              id: 's3',
              position: 0,
              isWarmup: false,
              reps: 10,
              weightKg: 30,
              restSeconds: 90,
              completedAt: null,
            },
          ],
        },
      ],
    } as unknown as WorkoutDoc;

    const input = builderToInput(builderFromDoc(doc));

    expect(input.name).toBe('Push Day');
    expect(input.notes).toBe('notes');
    expect(input.visibility).toBe('friends');
    expect(input.scheduledFor).toEqual(new Date('2026-07-10T00:00:00Z'));
    expect(input.exercises).toHaveLength(2);
    expect(input.exercises[0]).toMatchObject({ exerciseId: 'a', position: 0 });
    expect(input.exercises[1]).toMatchObject({ exerciseId: 'b', position: 1 });
    // superset ids survive as a shared group (values may be re-minted keys)
    expect(input.exercises[0]!.superSetId).toBeDefined();
    expect(input.exercises[0]!.superSetId).toBe(input.exercises[1]!.superSetId);
    expect(input.exercises[0]!.sets).toEqual([
      { position: 0, isWarmup: true, reps: 12, weightKg: 40, restSeconds: 60 },
      { position: 1, isWarmup: false, reps: 8, weightKg: 60, restSeconds: 90 },
    ]);
  });
});
