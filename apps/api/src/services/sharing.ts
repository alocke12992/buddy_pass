import { eq, schema, type Database } from '@buddy-pass/db';
import { getWorkoutDoc, type WorkoutDoc } from './workouts';

const { shareLinks, user } = schema;

export type ShareResolution =
  | { ok: false; reason: 'not_found' | 'revoked' }
  | {
      ok: true;
      link: typeof shareLinks.$inferSelect;
      workout: WorkoutDoc;
      owner: { name: string; image: string | null };
    };

/**
 * Token lookup shared by `sharing.resolve`, `workouts.clone`, and the OG page
 * (plans/API.md §2.6). The token *is* the access grant — visibility is bypassed.
 * Read-only: use_count increments on clone, not view.
 */
export async function resolveShareToken(db: Database, token: string): Promise<ShareResolution> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
  if (!link) return { ok: false, reason: 'not_found' };
  if (link.revokedAt) return { ok: false, reason: 'revoked' };
  const workout = await getWorkoutDoc(db, link.workoutId);
  if (!workout) return { ok: false, reason: 'not_found' };
  const [owner] = await db
    .select({ name: user.name, image: user.image })
    .from(user)
    .where(eq(user.id, workout.ownerId));
  return { ok: true, link, workout, owner: owner ?? { name: 'Someone', image: null } };
}

/** WorkoutDoc minus visibility/status noise — structure only, no completedAt (plans/API.md §2.6). */
export function toSharedWorkoutView(doc: WorkoutDoc) {
  return {
    id: doc.id,
    name: doc.name,
    notes: doc.notes,
    exerciseCount: doc.exerciseCount,
    setCount: doc.setCount,
    exercises: doc.exercises.map((e) => ({
      id: e.id,
      position: e.position,
      superSetId: e.superSetId,
      exercise: e.exercise,
      sets: e.sets.map((s) => ({
        id: s.id,
        position: s.position,
        isWarmup: s.isWarmup,
        reps: s.reps,
        weightKg: s.weightKg,
        restSeconds: s.restSeconds,
      })),
    })),
  };
}
