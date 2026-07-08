import type { WorkoutInput } from '@buddy-pass/shared';
import type { WorkoutDoc } from './api-types';

/** Structural subset so the hero logic stays a pure, testable function. */
export interface HeroCandidate {
  id: string;
  scheduledFor: Date | null;
}

export type HeroPick<T extends HeroCandidate> =
  { kind: 'in_progress'; workout: T } | { kind: 'planned'; workout: T } | { kind: 'empty' };

/**
 * Hero card priority (FRONTEND.md §3.1): ① in-progress ② next planned by
 * scheduled_for (earliest first — overdue floats up), then most recently
 * created unscheduled ③ empty. UUIDv7 ids are time-ordered, so id desc =
 * creation desc.
 */
export function pickHeroWorkout<T extends HeroCandidate>(
  inProgress: readonly T[],
  planned: readonly T[],
): HeroPick<T> {
  if (inProgress[0]) return { kind: 'in_progress', workout: inProgress[0] };
  const scheduled = planned
    .filter((w) => w.scheduledFor !== null)
    .sort((a, b) => a.scheduledFor!.getTime() - b.scheduledFor!.getTime());
  if (scheduled[0]) return { kind: 'planned', workout: scheduled[0] };
  const newest = [...planned].sort((a, b) => b.id.localeCompare(a.id))[0];
  return newest ? { kind: 'planned', workout: newest } : { kind: 'empty' };
}

/**
 * Rebuild the whole-document input from a doc — workouts.update is full-replace
 * (ADR-0003), so a reschedule resubmits everything with one field patched.
 */
export function workoutDocToInput(doc: WorkoutDoc): WorkoutInput {
  return {
    name: doc.name,
    notes: doc.notes ?? undefined,
    scheduledFor: doc.scheduledFor ?? undefined,
    visibility: doc.visibility,
    exercises: doc.exercises.map((we, i) => ({
      exerciseId: we.exercise.id,
      position: i,
      superSetId: we.superSetId ?? undefined,
      sets: we.sets.map((s, j) => ({
        position: j,
        isWarmup: s.isWarmup,
        reps: s.reps,
        weightKg: s.weightKg ?? 0, // db column is nullable; 0 = bodyweight
        restSeconds: s.restSeconds,
      })),
    })),
  };
}
