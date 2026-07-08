import { describe, expect, it } from 'vitest';
import { pickHeroWorkout } from './workouts';

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
