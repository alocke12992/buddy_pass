import { describe, expect, it } from 'vitest';
import { toSharedWorkoutView } from './sharing';
import type { WorkoutDoc } from './workouts';

const set = (id: string, position: number) => ({
  id,
  position,
  isWarmup: position === 0,
  reps: 8,
  weightKg: 60,
  restSeconds: 90,
  completedAt: new Date('2026-07-10T10:00:00Z'),
});

const exercise = (id: string, droppedAt: Date | null, setCount: number) => ({
  id: `we-${id}`,
  position: 0,
  superSetId: id === 'a' ? 'ss1' : null,
  droppedAt,
  exercise: { id, name: id },
  sets: Array.from({ length: setCount }, (_, i) => set(`s-${id}-${i}`, i)),
});

const doc = (exercises: ReturnType<typeof exercise>[]) =>
  ({
    id: 'w1',
    name: 'Push Day',
    status: 'completed',
    visibility: 'private',
    scheduledFor: null,
    startedAt: new Date('2026-07-10T09:00:00Z'),
    endedAt: new Date('2026-07-10T10:30:00Z'),
    ownerId: 'u1',
    originWorkoutId: null,
    notes: 'felt strong',
    exerciseCount: exercises.length,
    setCount: exercises.reduce((n, e) => n + e.sets.length, 0),
    exercises,
  }) as unknown as WorkoutDoc;

describe('toSharedWorkoutView', () => {
  it('previews the structure a clone would produce', () => {
    const view = toSharedWorkoutView(doc([exercise('a', null, 2), exercise('b', null, 1)]));
    expect(view).toMatchObject({
      id: 'w1',
      name: 'Push Day',
      notes: 'felt strong',
      exerciseCount: 2,
      setCount: 3,
    });
    expect(view.exercises[0]!.superSetId).toBe('ss1');
    expect(view.exercises.map((e) => e.exercise.id)).toEqual(['a', 'b']);
  });

  it('leaves dropped slots out, exactly as cloning does (ADR-0004)', () => {
    const view = toSharedWorkoutView(
      doc([exercise('a', null, 2), exercise('b', new Date('2026-07-10T09:30:00Z'), 3)]),
    );
    expect(view.exercises.map((e) => e.exercise.id)).toEqual(['a']);
    expect(view.exerciseCount).toBe(1);
    expect(view.setCount).toBe(2); // the dropped slot's logged sets don't count either
  });

  it('hides owner status, visibility, and set completion from viewers', () => {
    const view = toSharedWorkoutView(doc([exercise('a', null, 1)]));
    expect(view).not.toHaveProperty('status');
    expect(view).not.toHaveProperty('visibility');
    expect(view).not.toHaveProperty('ownerId');
    expect(view.exercises[0]!.sets[0]).not.toHaveProperty('completedAt');
    expect(view.exercises[0]!.sets[0]).toMatchObject({
      position: 0,
      isWarmup: true,
      reps: 8,
      weightKg: 60,
      restSeconds: 90,
    });
  });
});
