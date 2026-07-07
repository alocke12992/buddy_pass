import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { desc, eq, schema, type Database } from '@buddy-pass/db';
import { getWorkoutDoc, toSetOutput } from '../../services/workouts';
import { authedProcedure, router } from '../trpc';

const { workouts, workoutExercises, workoutSets } = schema;

type WorkoutStatus = (typeof workouts.$inferSelect)['status'];

// The hot path (ADR-0003): fine-grained, single-purpose mutations shaped like
// the events realtime sync mode will broadcast. Exercise structure is frozen
// once in progress; only sets are editable/appendable.

async function transition(
  db: Database,
  userId: string,
  workoutId: string,
  from: WorkoutStatus,
  to: WorkoutStatus,
  patch: Partial<typeof workouts.$inferInsert>,
) {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, workoutId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  if (row.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  if (row.status !== from) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Cannot move a ${row.status} workout to ${to}`,
    });
  }
  await db
    .update(workouts)
    .set({ status: to, ...patch })
    .where(eq(workouts.id, workoutId));
  return (await getWorkoutDoc(db, workoutId))!;
}

/** Load a set + its workout, enforcing owner + in_progress (sets are only mutable mid-workout). */
async function loadMutableSet(db: Database, userId: string, setId: string) {
  const [row] = await db
    .select({ set: workoutSets, workout: workouts })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutSets.id, setId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  if (row.workout.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  if (row.workout.status !== 'in_progress') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Workout is not in progress' });
  }
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
    transition(ctx.db, ctx.user.id, input.workoutId, 'in_progress', 'completed', {
      endedAt: new Date(),
    }),
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
      const [row] = await ctx.db
        .select({ workoutExercise: workoutExercises, workout: workouts })
        .from(workoutExercises)
        .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
        .where(eq(workoutExercises.id, input.workoutExerciseId));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (row.workout.ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (row.workout.status !== 'in_progress') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Workout is not in progress' });
      }

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
});
