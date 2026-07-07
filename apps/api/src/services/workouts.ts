import type { WorkoutInput } from '@buddy-pass/shared';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  lt,
  schema,
  sql,
  type Database,
  type SQL,
} from '@buddy-pass/db';
import { exerciseRelationsWith, toExerciseIndexEntry } from './exercises';

const { workouts, workoutExercises, workoutSets, shareLinks, userSettings } = schema;

type WorkoutRow = typeof workouts.$inferSelect;
type SetRow = typeof workoutSets.$inferSelect;

/** Transaction handle (or the db itself) — matches drizzle's callback parameter. */
export type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export function toSetOutput(s: SetRow) {
  return {
    id: s.id,
    position: s.position,
    isWarmup: s.isWarmup,
    reps: s.reps,
    weightKg: s.weightKg,
    restSeconds: s.restSeconds,
    completedAt: s.completedAt,
  };
}

function toWorkoutSummary(row: WorkoutRow, counts?: { exerciseCount: number; setCount: number }) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    visibility: row.visibility,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    ownerId: row.ownerId,
    originWorkoutId: row.originWorkoutId,
    exerciseCount: counts?.exerciseCount ?? 0,
    setCount: counts?.setCount ?? 0,
  };
}

type WorkoutDocRow = WorkoutRow & {
  exercises: (typeof workoutExercises.$inferSelect & {
    exercise: Parameters<typeof toExerciseIndexEntry>[0];
    sets: SetRow[];
  })[];
};

function toWorkoutDoc(row: WorkoutDocRow) {
  const exercises = row.exercises.map((we) => ({
    id: we.id,
    position: we.position,
    superSetId: we.superSetId,
    exercise: toExerciseIndexEntry(we.exercise),
    sets: we.sets.map(toSetOutput),
  }));
  return {
    ...toWorkoutSummary(row, {
      exerciseCount: exercises.length,
      setCount: exercises.reduce((n, e) => n + e.sets.length, 0),
    }),
    notes: row.notes,
    exercises,
  };
}
export type WorkoutDoc = ReturnType<typeof toWorkoutDoc>;

/** Full nested document — embeds ExerciseIndexEntry so the logging screen needs no second fetch. */
export async function getWorkoutDoc(db: DbOrTx, id: string): Promise<WorkoutDoc | null> {
  const row = await db.query.workouts.findFirst({
    where: eq(workouts.id, id),
    with: {
      exercises: {
        orderBy: [asc(workoutExercises.position)],
        with: {
          exercise: { with: exerciseRelationsWith },
          sets: { orderBy: [asc(workoutSets.position)] },
        },
      },
    },
  });
  return row ? toWorkoutDoc(row) : null;
}

export async function listWorkoutSummaries(
  db: Database,
  opts: {
    ownerId: string;
    status?: WorkoutRow['status'];
    /** Restrict to `visibility='friends'` (viewer is a friend, not the owner). */
    visibleOnly: boolean;
    cursor?: string;
    limit: number;
  },
) {
  const conds: SQL[] = [eq(workouts.ownerId, opts.ownerId)];
  if (opts.status) conds.push(eq(workouts.status, opts.status));
  if (opts.visibleOnly) conds.push(eq(workouts.visibility, 'friends'));
  if (opts.cursor) conds.push(lt(workouts.id, opts.cursor));

  // UUIDv7 ids are time-ordered → id desc = newest first (plans/API.md §1)
  const rows = await db
    .select()
    .from(workouts)
    .where(and(...conds))
    .orderBy(desc(workouts.id))
    .limit(opts.limit + 1);

  const page = rows.slice(0, opts.limit);
  const nextCursor = rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null;

  const ids = page.map((w) => w.id);
  const counts = ids.length
    ? await db
        .select({
          workoutId: workoutExercises.workoutId,
          exerciseCount: countDistinct(workoutExercises.id),
          setCount: count(workoutSets.id),
        })
        .from(workoutExercises)
        .leftJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
        .where(inArray(workoutExercises.workoutId, ids))
        .groupBy(workoutExercises.workoutId)
    : [];
  const countsById = new Map(counts.map((c) => [c.workoutId, c]));

  return { items: page.map((w) => toWorkoutSummary(w, countsById.get(w.id))), nextCursor };
}

/** Builder saves are whole-document (ADR-0003): children are replaced wholesale. */
export async function replaceWorkoutChildren(
  tx: DbOrTx,
  workoutId: string,
  exercises: WorkoutInput['exercises'],
) {
  await tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId));
  if (exercises.length === 0) return;
  const weRows = await tx
    .insert(workoutExercises)
    .values(
      exercises.map((e) => ({
        workoutId,
        exerciseId: e.exerciseId,
        position: e.position,
        superSetId: e.superSetId ?? null,
      })),
    )
    .returning({ id: workoutExercises.id });
  const setValues = exercises.flatMap((e, i) =>
    e.sets.map((s) => ({
      workoutExerciseId: weRows[i]!.id,
      position: s.position,
      isWarmup: s.isWarmup,
      reps: s.reps,
      weightKg: s.weightKg,
      restSeconds: s.restSeconds,
    })),
  );
  if (setValues.length > 0) await tx.insert(workoutSets).values(setValues);
}

/** The caller's default visibility for new/cloned workouts ('private' until onboarding). */
export async function defaultVisibilityFor(db: DbOrTx, userId: string) {
  const [settings] = await db
    .select({ visibility: userSettings.defaultWorkoutVisibility })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return settings?.visibility ?? 'private';
}

/**
 * One copy routine, two entry points (plans/API.md §2.2): structure copied as-is,
 * `completed_at` never copied, visibility is the cloner's default, scheduling cleared.
 */
export async function cloneWorkout(
  db: Database,
  opts: {
    sourceId: string;
    newOwnerId: string;
    visibility: 'private' | 'friends';
    /** Set on the token path — clone attribution bumps use_count in the same transaction. */
    shareLinkId?: string;
  },
) {
  return db.transaction(async (tx) => {
    const source = await tx.query.workouts.findFirst({
      where: eq(workouts.id, opts.sourceId),
      with: {
        exercises: {
          orderBy: [asc(workoutExercises.position)],
          with: { sets: { orderBy: [asc(workoutSets.position)] } },
        },
      },
    });
    if (!source) return null;

    const [created] = await tx
      .insert(workouts)
      .values({
        ownerId: opts.newOwnerId,
        name: source.name,
        notes: source.notes,
        status: 'planned',
        visibility: opts.visibility,
        originWorkoutId: source.id,
      })
      .returning({ id: workouts.id });

    if (source.exercises.length > 0) {
      const weRows = await tx
        .insert(workoutExercises)
        .values(
          source.exercises.map((we) => ({
            workoutId: created!.id,
            exerciseId: we.exerciseId,
            position: we.position,
            superSetId: we.superSetId,
          })),
        )
        .returning({ id: workoutExercises.id });
      const setValues = source.exercises.flatMap((we, i) =>
        we.sets.map((s) => ({
          workoutExerciseId: weRows[i]!.id,
          position: s.position,
          isWarmup: s.isWarmup,
          reps: s.reps,
          weightKg: s.weightKg,
          restSeconds: s.restSeconds,
        })),
      );
      if (setValues.length > 0) await tx.insert(workoutSets).values(setValues);
    }

    if (opts.shareLinkId) {
      await tx
        .update(shareLinks)
        .set({ useCount: sql`${shareLinks.useCount} + 1` })
        .where(eq(shareLinks.id, opts.shareLinkId));
    }

    return created!.id;
  });
}
