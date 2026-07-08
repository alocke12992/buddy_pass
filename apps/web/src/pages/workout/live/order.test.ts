import { describe, expect, it } from 'vitest';
import type { WorkoutDoc } from '@/lib/api-types';
import { buildDisplayGroups, completedVolumeKg, countSets, currentSetId } from './order';

const set = (
  id: string,
  opts: Partial<{
    completedAt: Date | null;
    isWarmup: boolean;
    reps: number;
    weightKg: number;
  }> = {},
) => ({
  id,
  position: 0,
  isWarmup: opts.isWarmup ?? false,
  reps: opts.reps ?? 10,
  weightKg: opts.weightKg ?? 50,
  restSeconds: 90,
  completedAt: opts.completedAt ?? null,
});

const exercise = (id: string, superSetId: string | null, sets: ReturnType<typeof set>[]) => ({
  id,
  position: 0,
  superSetId,
  exercise: { id: `lib-${id}`, name: id } as never,
  sets,
});

const doc = (exercises: ReturnType<typeof exercise>[]) => ({ exercises }) as unknown as WorkoutDoc;

describe('buildDisplayGroups', () => {
  it('interleaves superset sets round-robin (A1 B1 A2 B2)', () => {
    const groups = buildDisplayGroups(
      doc([
        exercise('A', 'ss', [set('a1'), set('a2')]),
        exercise('B', 'ss', [set('b1'), set('b2')]),
      ]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.isSuperset).toBe(true);
    expect(groups[0]!.rows.map((r) => r.set.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('keeps plain exercises sequential and separate', () => {
    const groups = buildDisplayGroups(
      doc([exercise('A', null, [set('a1'), set('a2')]), exercise('B', null, [set('b1')])]),
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.rows.map((r) => r.set.id)).toEqual(['a1', 'a2']);
  });

  it('handles ragged superset lengths', () => {
    const groups = buildDisplayGroups(
      doc([
        exercise('A', 'ss', [set('a1'), set('a2'), set('a3')]),
        exercise('B', 'ss', [set('b1')]),
      ]),
    );
    expect(groups[0]!.rows.map((r) => r.set.id)).toEqual(['a1', 'b1', 'a2', 'a3']);
  });

  it('marks the last set of each exercise (rest never auto-plays after it)', () => {
    const groups = buildDisplayGroups(
      doc([
        exercise('A', 'ss', [set('a1'), set('a2')]),
        exercise('B', 'ss', [set('b1'), set('b2')]),
      ]),
    );
    const byId = Object.fromEntries(groups[0]!.rows.map((r) => [r.set.id, r.isLastSetOfExercise]));
    expect(byId).toEqual({ a1: false, b1: false, a2: true, b2: true });
  });
});

describe('currentSetId', () => {
  it('is the first uncompleted set in display order', () => {
    const groups = buildDisplayGroups(
      doc([
        exercise('A', 'ss', [set('a1', { completedAt: new Date() }), set('a2')]),
        exercise('B', 'ss', [set('b1')]),
      ]),
    );
    expect(currentSetId(groups)).toBe('b1'); // a1 done → next in interleave is b1
  });

  it('is null when everything is done', () => {
    const groups = buildDisplayGroups(
      doc([exercise('A', null, [set('a1', { completedAt: new Date() })])]),
    );
    expect(currentSetId(groups)).toBeNull();
  });
});

describe('summary math', () => {
  it('counts sets and sums volume over completed non-warm-up sets only', () => {
    const d = doc([
      exercise('A', null, [
        set('a1', { completedAt: new Date(), isWarmup: true, reps: 12, weightKg: 20 }),
        set('a2', { completedAt: new Date(), reps: 10, weightKg: 50 }),
        set('a3', { reps: 10, weightKg: 50 }),
      ]),
    ]);
    expect(countSets(d)).toEqual({ completed: 2, total: 3 });
    expect(completedVolumeKg(d)).toBe(500); // warm-up + incomplete excluded
  });
});
