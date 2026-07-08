import { describe, expect, it } from 'vitest';
import type { WorkoutSummary } from '@/lib/api-types';
import { calendarDots, listForSelection, workoutDate } from './logData';

const w = (
  id: string,
  status: WorkoutSummary['status'],
  dates: Partial<Pick<WorkoutSummary, 'scheduledFor' | 'startedAt' | 'endedAt'>> = {},
) =>
  ({
    id,
    name: id,
    status,
    scheduledFor: dates.scheduledFor ?? null,
    startedAt: dates.startedAt ?? null,
    endedAt: dates.endedAt ?? null,
  }) as WorkoutSummary;

const d = (day: number, hour = 12) => new Date(2026, 6, day, hour); // July 2026, local

describe('workoutDate', () => {
  it('anchors completions to endedAt and plans to scheduledFor', () => {
    expect(workoutDate(w('a', 'completed', { startedAt: d(1), endedAt: d(2) }))).toEqual(d(2));
    expect(workoutDate(w('b', 'planned', { scheduledFor: d(9) }))).toEqual(d(9));
    expect(workoutDate(w('c', 'planned'))).toBeNull(); // unscheduled plan floats
    expect(workoutDate(w('d', 'in_progress', { startedAt: d(3) }))).toEqual(d(3));
  });
});

describe('calendarDots', () => {
  it('volt dots for completed days, muted for planned; one per day', () => {
    const dots = calendarDots([
      w('a', 'completed', { endedAt: d(2, 9) }),
      w('b', 'completed', { endedAt: d(2, 18) }), // same day → one dot
      w('c', 'planned', { scheduledFor: d(9) }),
      w('d', 'cancelled', { endedAt: d(4) }), // no dot
    ]);
    expect(dots.completed).toHaveLength(1);
    expect(dots.planned).toHaveLength(1);
  });
});

describe('listForSelection', () => {
  const items = [
    w('done1', 'completed', { endedAt: d(2) }),
    w('done2', 'completed', { endedAt: d(5) }),
    w('gone', 'cancelled', { endedAt: d(3) }),
    w('plan', 'planned', { scheduledFor: d(9) }),
    w('floating', 'planned'),
  ];

  it('defaults to reverse-chron history without plans', () => {
    expect(listForSelection(items, null).map((x) => x.id)).toEqual(['done2', 'gone', 'done1']);
  });

  it('a selected future day surfaces its planned workout', () => {
    expect(listForSelection(items, d(9, 0)).map((x) => x.id)).toEqual(['plan']);
  });

  it('a selected past day filters history to that day', () => {
    expect(listForSelection(items, d(2, 23)).map((x) => x.id)).toEqual(['done1']);
  });
});
