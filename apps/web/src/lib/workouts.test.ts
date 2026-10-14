import { describe, expect, it } from 'vitest';
import type { WorkoutDoc } from './api-types';
import { pickHeroWorkout, workoutDocToInput } from './workouts';

// UUIDv7-ish ids: lexicographic order must match creation order
const w = (id: string, scheduledFor: Date | null = null) => ({ id, scheduledFor });
const day = (n: number) => new Date(Date.UTC(2026, 6, n));

describe('pickHeroWorkout (FRONTEND.md §3.1 priority)', () => {
  it('an in-progress workout always wins', () => {
    const pick = pickHeroWorkout([w('03')], [w('01', day(1)), w('02')]);
    expect(pick).toMatchObject({ kind: 'in_progress', workout: { id: '03' } });
  });

  it('earliest scheduled planned workout beats newer unscheduled ones', () => {
    const pick = pickHeroWorkout([], [w('05'), w('02', day(20)), w('03', day(10))]);
    expect(pick).toMatchObject({ kind: 'planned', workout: { id: '03' } });
  });

  it('overdue scheduled workouts float to the front', () => {
    const pick = pickHeroWorkout([], [w('04', day(9)), w('02', day(2))]); // "today" ≈ day 7
    expect(pick).toMatchObject({ kind: 'planned', workout: { id: '02' } });
  });

  it('falls back to the most recently created unscheduled planned workout', () => {
    const pick = pickHeroWorkout([], [w('01'), w('04'), w('02')]);
    expect(pick).toMatchObject({ kind: 'planned', workout: { id: '04' } });
  });

  it('empty when nothing is in progress or planned', () => {
    expect(pickHeroWorkout([], [])).toEqual({ kind: 'empty' });
  });
});

describe('workoutDocToInput (ADR-0003 whole-doc replace)', () => {
  const exercise = (
    id: string,
    position: number,
    superSetId: string | null,
    sets: { position: number; weightKg: number | null }[],
  ) => ({
    id: `we-${id}`,
    position,
    superSetId,
    droppedAt: null,
    exercise: { id, name: id },
    sets: sets.map((s, i) => ({
      id: `s-${id}-${i}`,
      position: s.position,
      isWarmup: i === 0,
      reps: 8,
      weightKg: s.weightKg,
      restSeconds: 120,
      completedAt: new Date(),
    })),
  });

  const doc = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'w1',
      name: 'Push Day',
      status: 'planned',
      visibility: 'friends',
      scheduledFor: new Date('2026-07-10T00:00:00Z'),
      startedAt: null,
      endedAt: null,
      ownerId: 'u1',
      originWorkoutId: null,
      notes: 'felt strong',
      exercises: [
        exercise('a', 5, 'ss1', [
          { position: 3, weightKg: 40 },
          { position: 9, weightKg: 60 },
        ]),
        exercise('b', 9, 'ss1', [{ position: 7, weightKg: null }]),
      ],
      ...overrides,
    }) as unknown as WorkoutDoc;

  it('resubmits the whole document so one patched field can be saved', () => {
    const input = workoutDocToInput(doc());
    expect(input).toMatchObject({
      name: 'Push Day',
      notes: 'felt strong',
      visibility: 'friends',
      scheduledFor: new Date('2026-07-10T00:00:00Z'),
    });
    expect(input.exercises.map((e) => e.exerciseId)).toEqual(['a', 'b']);
    expect(input.exercises[0]!.superSetId).toBe('ss1');
  });

  it('renumbers positions from document order, ignoring stored gaps', () => {
    const input = workoutDocToInput(doc());
    expect(input.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(input.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1]);
  });

  it('keeps set numbers and reads a bodyweight set as 0 kg', () => {
    const input = workoutDocToInput(doc());
    expect(input.exercises[0]!.sets[0]).toEqual({
      position: 0,
      isWarmup: true,
      reps: 8,
      weightKg: 40,
      restSeconds: 120,
    });
    expect(input.exercises[1]!.sets[0]!.weightKg).toBe(0);
  });

  it('drops absent notes, schedule, and superset ids rather than sending null', () => {
    const input = workoutDocToInput(
      doc({
        notes: null,
        scheduledFor: null,
        exercises: [exercise('a', 0, null, [{ position: 0, weightKg: 50 }])],
      }),
    );
    expect(input.notes).toBeUndefined();
    expect(input.scheduledFor).toBeUndefined();
    expect(input.exercises[0]!.superSetId).toBeUndefined();
  });
});
