import type { ExerciseIndexEntry } from '@/lib/api-types';

const SUGGESTION_CAP = 10;

/**
 * Replacement suggestions: must share a primary muscle with the target;
 * same equipment, then mechanic, then level rank closer. Already-added
 * exercises are excluded (no duplicates in a workout).
 */
export function rankReplacements(
  target: ExerciseIndexEntry,
  library: readonly ExerciseIndexEntry[],
  excludeIds: ReadonlySet<string>,
): ExerciseIndexEntry[] {
  return library
    .filter(
      (e) =>
        e.id !== target.id &&
        !excludeIds.has(e.id) &&
        e.primaryMuscles.some((m) => target.primaryMuscles.includes(m)),
    )
    .map((e) => {
      let score = 0;
      if (e.equipment?.id === target.equipment?.id) score += 3;
      if (e.mechanic !== null && e.mechanic === target.mechanic) score += 2;
      if (e.level === target.level) score += 1;
      score += e.primaryMuscles.filter((m) => target.primaryMuscles.includes(m)).length - 1;
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, SUGGESTION_CAP)
    .map(({ e }) => e);
}
