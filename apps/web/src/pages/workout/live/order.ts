import type { WorkoutDoc } from '@/lib/api-types';

type DocExercise = WorkoutDoc['exercises'][number];
type DocSet = DocExercise['sets'][number];

export interface DisplayRow {
  exercise: DocExercise;
  set: DocSet;
  /** Index of this set within its own exercise (0-based). */
  setIndex: number;
  /** True when this is the final set of its exercise — rest never auto-plays after it (MVP.md §5). */
  isLastSetOfExercise: boolean;
}

export interface DisplayGroup {
  /** Superset group id, or the sole exercise's row id for singletons. */
  key: string;
  isSuperset: boolean;
  exercises: DocExercise[];
  rows: DisplayRow[];
}

/**
 * Live-screen order (FRONTEND.md §3.3): contiguous superset groups render
 * bracketed with their sets interleaved round-robin (A1 B1 A2 B2 …); plain
 * exercises keep their sets in sequence.
 */
export function buildDisplayGroups(doc: WorkoutDoc): DisplayGroup[] {
  const groups: DisplayGroup[] = [];
  let i = 0;
  while (i < doc.exercises.length) {
    const current = doc.exercises[i]!;
    let runEnd = i + 1;
    if (current.superSetId !== null) {
      while (
        runEnd < doc.exercises.length &&
        doc.exercises[runEnd]!.superSetId === current.superSetId
      ) {
        runEnd++;
      }
    }
    const exercises = doc.exercises.slice(i, runEnd);
    const isSuperset = exercises.length > 1;

    const rows: DisplayRow[] = [];
    if (isSuperset) {
      const maxSets = Math.max(...exercises.map((e) => e.sets.length));
      for (let round = 0; round < maxSets; round++) {
        for (const exercise of exercises) {
          const set = exercise.sets[round];
          if (set) {
            rows.push({
              exercise,
              set,
              setIndex: round,
              isLastSetOfExercise: round === exercise.sets.length - 1,
            });
          }
        }
      }
    } else {
      for (const [index, set] of exercises[0]!.sets.entries()) {
        rows.push({
          exercise: exercises[0]!,
          set,
          setIndex: index,
          isLastSetOfExercise: index === exercises[0]!.sets.length - 1,
        });
      }
    }

    groups.push({
      key: current.superSetId ?? current.id,
      isSuperset,
      exercises,
      rows,
    });
    i = runEnd;
  }
  return groups;
}

/** The first uncompleted set in display order — visually dominant on screen. */
export function currentSetId(groups: DisplayGroup[]): string | null {
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.set.completedAt === null) return row.set.id;
    }
  }
  return null;
}

export function countSets(doc: WorkoutDoc): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const exercise of doc.exercises) {
    for (const set of exercise.sets) {
      total++;
      if (set.completedAt !== null) completed++;
    }
  }
  return { completed, total };
}

/** Σ reps × kg over completed, non-warm-up sets (matches stats.* volume, API.md §2.7). */
export function completedVolumeKg(doc: WorkoutDoc): number {
  let volume = 0;
  for (const exercise of doc.exercises) {
    for (const set of exercise.sets) {
      if (set.completedAt !== null && !set.isWarmup) volume += set.reps * (set.weightKg ?? 0);
    }
  }
  return volume;
}
