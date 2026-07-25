import type { WorkoutInput } from '@buddy-pass/shared';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
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
    /** Non-null = dropped mid-workout: off the live plan, still on the record (ADR-0004). */
    droppedAt: we.droppedAt,
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
        // id breaks position ties: a dropped slot (older uuidv7) sorts before its replacement
        orderBy: [asc(workoutExercises.position), asc(workoutExercises.id)],
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

// --- mid-workout structure edits (ADR-0004) ---------------------------------

type SetTemplate = Pick<SetRow, 'isWarmup' | 'reps' | 'weightKg' | 'restSeconds'>;

/** Same starting block the builder gives a freshly picked exercise: 3 × 8 at bodyweight. */
const defaultSetTemplates = (): SetTemplate[] =>
  Array.from({ length: 3 }, () => ({ isWarmup: false, reps: 8, weightKg: 0, restSeconds: 90 }));

/**
 * How an exercise added mid-workout gets its numbers: whatever the user actually
 * completed the last time they did it, falling back to the builder's defaults.
 */
async function lastPerformedSets(
  db: DbOrTx,
  opts: { userId: string; exerciseId: string },
): Promise<SetTemplate[]> {
  const [previous] = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(workoutSets, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .where(
      and(
        eq(workouts.ownerId, opts.userId),
        eq(workouts.status, 'completed'),
        eq(workoutExercises.exerciseId, opts.exerciseId),
        isNotNull(workoutSets.completedAt),
      ),
    )
    // one row per completed set — the first is the most recent slot (uuidv7 breaks same-workout ties)
    .orderBy(desc(workouts.endedAt), desc(workoutExercises.id))
    .limit(1);
  if (!previous) return defaultSetTemplates();

  const rows = await db
    .select()
    .from(workoutSets)
    .where(and(eq(workoutSets.workoutExerciseId, previous.id), isNotNull(workoutSets.completedAt)))
    .orderBy(asc(workoutSets.position));
  return rows.map((s) => ({
    isWarmup: s.isWarmup,
    reps: s.reps,
    weightKg: s.weightKg,
    restSeconds: s.restSeconds,
  }));
}

/** One exercise into a live workout, prefilled from the caller's last performance of it. */
async function insertLiveExercise(
  tx: DbOrTx,
  opts: {
    workoutId: string;
    userId: string;
    exerciseId: string;
    position: number;
    superSetId: string | null;
  },
) {
  const [created] = await tx
    .insert(workoutExercises)
    .values({
      workoutId: opts.workoutId,
      exerciseId: opts.exerciseId,
      position: opts.position,
      superSetId: opts.superSetId,
    })
    .returning({ id: workoutExercises.id });
  const templates = await lastPerformedSets(tx, opts);
  await tx.insert(workoutSets).values(
    templates.map((t, position) => ({
      workoutExerciseId: created!.id,
      position,
      ...t,
    })),
  );
}

/**
 * Take a slot off the live plan. Its unfinished sets were only ever a plan, so
 * they go; anything completed is a record of work done, so the slot survives
 * as *dropped* instead of being erased. Superset membership is a plan concept,
 * so it's cleared — otherwise a dropped slot would still bracket with the
 * exercise that replaced it.
 */
async function dropOrEraseExercise(tx: DbOrTx, workoutExerciseId: string) {
  await tx
    .delete(workoutSets)
    .where(
      and(eq(workoutSets.workoutExerciseId, workoutExerciseId), isNull(workoutSets.completedAt)),
    );
  const [remaining] = await tx
    .select({ n: count() })
    .from(workoutSets)
    .where(eq(workoutSets.workoutExerciseId, workoutExerciseId));
  if ((remaining?.n ?? 0) === 0) {
    await tx.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId));
    return;
  }
  await tx
    .update(workoutExercises)
    .set({ droppedAt: new Date(), superSetId: null })
    .where(eq(workoutExercises.id, workoutExerciseId));
}

/** Append to the end of the live plan, skipping exercises already in it. */
export async function addExercisesToWorkout(
  db: Database,
  opts: { workoutId: string; userId: string; exerciseIds: readonly string[] },
) {
  await db.transaction(async (tx) => {
    const present = await tx
      .select({ exerciseId: workoutExercises.exerciseId })
      .from(workoutExercises)
      .where(
        and(eq(workoutExercises.workoutId, opts.workoutId), isNull(workoutExercises.droppedAt)),
      );
    const alreadyPresent = new Set(present.map((e) => e.exerciseId));
    const toAdd = [...new Set(opts.exerciseIds)].filter((id) => !alreadyPresent.has(id));
    if (toAdd.length === 0) return;

    const [highest] = await tx
      .select({ position: max(workoutExercises.position) })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, opts.workoutId));

    let position = (highest?.position ?? -1) + 1;
    for (const exerciseId of toAdd) {
      await insertLiveExercise(tx, {
        workoutId: opts.workoutId,
        userId: opts.userId,
        exerciseId,
        position,
        superSetId: null,
      });
      position++;
    }
  });
}

/** Swap the movement in a live slot: the old one is dropped, the new one inherits its place. */
export async function replaceLiveExercise(
  db: Database,
  opts: { slot: typeof workoutExercises.$inferSelect; userId: string; exerciseId: string },
) {
  await db.transaction(async (tx) => {
    await dropOrEraseExercise(tx, opts.slot.id);
    await insertLiveExercise(tx, {
      workoutId: opts.slot.workoutId,
      userId: opts.userId,
      exerciseId: opts.exerciseId,
      position: opts.slot.position,
      superSetId: opts.slot.superSetId,
    });
  });
}

export async function removeLiveExercise(db: Database, workoutExerciseId: string) {
  await db.transaction((tx) => dropOrEraseExercise(tx, workoutExerciseId));
}

/**
 * Erase slots left with no sets at all — deleting sets (BUD-8) can empty one, as
 * can planning an exercise and never giving it a set. Either way the slot records
 * neither an intention nor work done. Run at `finish` so the completed workout
 * reads as what happened. Dropped slots are excluded on principle: they are a
 * record, never erased (ADR-0004), even though one always keeps a completed set.
 */
export async function discardEmptyExercises(db: DbOrTx, workoutId: string) {
  await db.delete(workoutExercises).where(
    and(
      eq(workoutExercises.workoutId, workoutId),
      isNull(workoutExercises.droppedAt),
      sql`not exists (
        select 1 from ${workoutSets} where ${workoutSets.workoutExerciseId} = ${workoutExercises.id}
      )`,
    ),
  );
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
          // A clone is the plan as performed: dropped slots were swapped out or
          // removed, so copying them would resurrect them beside their replacement
          where: isNull(workoutExercises.droppedAt),
          orderBy: [asc(workoutExercises.position), asc(workoutExercises.id)],
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
          // renumbered: filtering dropped slots can leave gaps in the source's positions
          source.exercises.map((we, position) => ({
            workoutId: created!.id,
            exerciseId: we.exerciseId,
            position,
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
