import type { WorkoutSummary } from '@/lib/api-types';

/**
 * Calendar/history anchor date for a workout: completions live on the day
 * they ended, plans on their scheduled day (unscheduled plans have no spot
 * on the time view until selected via the future-day rule).
 */
export function workoutDate(w: WorkoutSummary): Date | null {
  if (w.status === 'planned') return w.scheduledFor;
  return w.endedAt ?? w.startedAt ?? null;
}

/** Local-day key — the calendar is a local-time view. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CalendarDots {
  /** Days with at least one completed workout — volt dots. */
  completed: Date[];
  /** Days with planned workouts — muted dots. */
  planned: Date[];
}

export function calendarDots(items: readonly WorkoutSummary[]): CalendarDots {
  const completed = new Map<string, Date>();
  const planned = new Map<string, Date>();
  for (const w of items) {
    const date = workoutDate(w);
    if (!date) continue;
    if (w.status === 'completed') completed.set(dayKey(date), date);
    else if (w.status === 'planned') planned.set(dayKey(date), date);
  }
  return { completed: [...completed.values()], planned: [...planned.values()] };
}

/**
 * The list under the calendar (FRONTEND.md §3.5): no selection → full history
 * (everything but unscheduled plans' future noise: completed, cancelled,
 * in-progress), reverse-chron. A selected day → everything anchored to that
 * day, planned included.
 */
export function listForSelection(
  items: readonly WorkoutSummary[],
  selectedDay: Date | null,
): WorkoutSummary[] {
  const dated = items
    .map((w) => ({ w, date: workoutDate(w) }))
    .filter((x): x is { w: WorkoutSummary; date: Date } => x.date !== null);

  const visible = selectedDay
    ? dated.filter((x) => dayKey(x.date) === dayKey(selectedDay))
    : dated.filter((x) => x.w.status !== 'planned');

  return visible.sort((a, b) => b.date.getTime() - a.date.getTime()).map((x) => x.w);
}
