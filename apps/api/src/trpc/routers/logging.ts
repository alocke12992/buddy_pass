import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { desc, eq, schema, type Database } from '@buddy-pass/db';
import { assertExercisesExist } from '../../services/exercises';
import {
  addExercisesToWorkout,
  discardEmptyExercises,
  getWorkoutDoc,
  removeLiveExercise,
  replaceLiveExercise,
  toSetOutput,
  type DbOrTx,
} from '../../services/workouts';
import { authedProcedure, router } from '../trpc';

const { workouts, workoutExercises, workoutSets } = schema;

type WorkoutStatus = (typeof workouts.$inferSelect)['status'];

// The hot path (ADR-0003): fine-grained, single-purpose mutations shaped like
// the events realtime sync mode will broadcast. Sets and — since ADR-0004 —
// the exercise list itself are editable while a workout is in progress.

async function transition(
  db: Database,
  userId: string,
  workoutId: string,
  from: WorkoutStatus,
  to: WorkoutStatus,
  patch: Partial<typeof workouts.$inferInsert>,
  /** Last chance to tidy the document, in the same transaction as the status flip. */
  beforeSeal?: (tx: DbOrTx, workoutId: string) => Promise<void>,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(workouts).where(eq(workouts.id, workoutId));
    if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
    if (row.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
    if (row.status !== from) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cannot move a ${row.status} workout to ${to}`,
      });
    }
    await beforeSeal?.(tx, workoutId);
    await tx
      .update(workouts)
      .set({ status: to, ...patch })
      .where(eq(workouts.id, workoutId));
  });
  return (await getWorkoutDoc(db, workoutId))!;
}

function assertLive(workout: typeof workouts.$inferSelect | undefined, userId: string) {
  if (!workout) throw new TRPCError({ code: 'NOT_FOUND' });
  if (workout.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  if (workout.status !== 'in_progress') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Workout is not in progress' });
  }
  return workout;
}

async function loadLiveWorkout(db: Database, userId: string, workoutId: string) {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, workoutId));
  return assertLive(row, userId);
}

/** Dropped slots are frozen records of work done — nothing mutates them again. */
function assertNotDropped(slot: typeof workoutExercises.$inferSelect) {
  if (slot.droppedAt !== null) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Exercise is no longer in this workout' });
  }
}

async function loadLiveExercise(db: Database, userId: string, workoutExerciseId: string) {
  const [row] = await db
    .select({ slot: workoutExercises, workout: workouts })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  assertLive(row.workout, userId);
  assertNotDropped(row.slot);
  return row.slot;
}

/** Load a set + its workout, enforcing owner + in_progress (sets are only mutable mid-workout). */
async function loadMutableSet(db: Database, userId: string, setId: string) {
  const [row] = await db
    .select({ set: workoutSets, slot: workoutExercises, workout: workouts })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutSets.id, setId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  assertLive(row.workout, userId);
  assertNotDropped(row.slot);
  return row.set;
}

async function updateSetRow(
  db: Database,
  setId: string,
  patch: Partial<typeof workoutSets.$inferInsert>,
) {
  const [updated] = await db
    .update(workoutSets)
    .set(patch)
    .where(eq(workoutSets.id, setId))
    .returning();
  return toSetOutput(updated!);
}

const setPatchSchema = z.object({
  setId: z.uuid(),
  reps: z.number().int().min(0).max(10_000).optional(),
  weightKg: z.number().min(0).max(2_000).optional(),
});

export const loggingRouter = router({
  start: authedProcedure.input(z.object({ workoutId: z.uuid() })).mutation(({ ctx, input }) =>
    transition(ctx.db, ctx.user.id, input.workoutId, 'planned', 'in_progress', {
      startedAt: new Date(),
    }),
  ),

  finish: authedProcedure.input(z.object({ workoutId: z.uuid() })).mutation(({ ctx, input }) =>
    // Tidy before sealing: a slot emptied of every set records nothing.
    transition(
      ctx.db,
      ctx.user.id,
      input.workoutId,
      'in_progress',
      'completed',
      { endedAt: new Date() },
      discardEmptyExercises,
    ),
  ),

  cancel: authedProcedure.input(z.object({ workoutId: z.uuid() })).mutation(({ ctx, input }) =>
    transition(ctx.db, ctx.user.id, input.workoutId, 'in_progress', 'cancelled', {
      endedAt: new Date(),
    }),
  ),

  /** The common "adjust then check off" gesture — one round trip. */
  completeSet: authedProcedure.input(setPatchSchema).mutation(async ({ ctx, input }) => {
    await loadMutableSet(ctx.db, ctx.user.id, input.setId);
    return updateSetRow(ctx.db, input.setId, {
      completedAt: new Date(),
      ...(input.reps !== undefined ? { reps: input.reps } : {}),
      ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
    });
  }),

  uncompleteSet: authedProcedure
    .input(z.object({ setId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await loadMutableSet(ctx.db, ctx.user.id, input.setId);
      return updateSetRow(ctx.db, input.setId, { completedAt: null });
    }),

  /** Edit without completing; also legal on already-completed sets (fix typos). */
  updateSet: authedProcedure
    .input(
      setPatchSchema.extend({
        restSeconds: z.number().int().min(0).max(3_600).optional(),
        isWarmup: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await loadMutableSet(ctx.db, ctx.user.id, input.setId);
      const { setId: _setId, ...patch } = input;
      return updateSetRow(ctx.db, input.setId, patch);
    }),

  /** "One more set": appends at max position + 1, defaults copied from the exercise's last set. */
  addSet: authedProcedure
    .input(z.object({ workoutExerciseId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await loadLiveExercise(ctx.db, ctx.user.id, input.workoutExerciseId);

      const [last] = await ctx.db
        .select()
        .from(workoutSets)
        .where(eq(workoutSets.workoutExerciseId, input.workoutExerciseId))
        .orderBy(desc(workoutSets.position))
        .limit(1);

      const [created] = await ctx.db
        .insert(workoutSets)
        .values({
          workoutExerciseId: input.workoutExerciseId,
          position: (last?.position ?? -1) + 1,
          isWarmup: false,
          reps: last?.reps ?? 8,
          weightKg: last?.weightKg ?? 0,
          restSeconds: last?.restSeconds ?? 90,
        })
        .returning();
      return toSetOutput(created!);
    }),

  /**
   * Drop a mis-tapped or abandoned set. A hard delete: only reachable while the
   * workout is `in_progress`, so no completed record is ever rewritten. Positions
   * are left gapped — `addSet` only reads the max, and nothing enforces contiguity.
   */
  removeSet: authedProcedure
    .input(z.object({ setId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const set = await loadMutableSet(ctx.db, ctx.user.id, input.setId);
      await ctx.db.delete(workoutSets).where(eq(workoutSets.id, input.setId));
      return toSetOutput(set);
    }),

  /**
   * Mid-session plan edits (ADR-0004). Structure changes reshuffle ids, so these
   * return the whole document rather than a row — the client re-seeds its cache.
   */
  addExercises: authedProcedure
    .input(z.object({ workoutId: z.uuid(), exerciseIds: z.array(z.uuid()).min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      await loadLiveWorkout(ctx.db, ctx.user.id, input.workoutId);
      await assertExercisesExist(ctx.db, input.exerciseIds);
      await addExercisesToWorkout(ctx.db, {
        workoutId: input.workoutId,
        userId: ctx.user.id,
        exerciseIds: input.exerciseIds,
      });
      return (await getWorkoutDoc(ctx.db, input.workoutId))!;
    }),

  replaceExercise: authedProcedure
    .input(z.object({ workoutExerciseId: z.uuid(), exerciseId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const slot = await loadLiveExercise(ctx.db, ctx.user.id, input.workoutExerciseId);
      await assertExercisesExist(ctx.db, [input.exerciseId]);
      await replaceLiveExercise(ctx.db, {
        slot,
        userId: ctx.user.id,
        exerciseId: input.exerciseId,
      });
      return (await getWorkoutDoc(ctx.db, slot.workoutId))!;
    }),

  removeExercise: authedProcedure
    .input(z.object({ workoutExerciseId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const slot = await loadLiveExercise(ctx.db, ctx.user.id, input.workoutExerciseId);
      await removeLiveExercise(ctx.db, slot.id);
      return (await getWorkoutDoc(ctx.db, slot.workoutId))!;
    }),
});
