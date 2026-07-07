import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  cloneWorkoutInputSchema,
  workoutInputSchema,
  workoutListInputSchema,
  type WorkoutInput,
} from '@buddy-pass/shared';
import { eq, inArray, schema } from '@buddy-pass/db';
import { canViewWorkout, requireUserScope } from '../../services/access';
import { resolveShareToken } from '../../services/sharing';
import {
  cloneWorkout,
  defaultVisibilityFor,
  getWorkoutDoc,
  listWorkoutSummaries,
  replaceWorkoutChildren,
  type DbOrTx,
} from '../../services/workouts';
import { authedProcedure, router } from '../trpc';

const { workouts, exercises } = schema;

/** FK violations read as 500s — surface unknown exercise ids as BAD_REQUEST instead. */
async function assertExerciseIdsExist(db: DbOrTx, input: WorkoutInput) {
  const ids = [...new Set(input.exercises.map((e) => e.exerciseId))];
  if (ids.length === 0) return;
  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(inArray(exercises.id, ids));
  if (found.length !== ids.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown exercise id' });
  }
}

async function loadWorkoutRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, id));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  return row;
}

/** Document-style CRUD + clone (ADR-0003: builder writes are whole-document, `planned` only). */
export const workoutsRouter = router({
  list: authedProcedure.input(workoutListInputSchema).query(async ({ ctx, input }) => {
    const ownerId = input.ownerId ?? ctx.user.id;
    const scope = await requireUserScope(ctx.db, ctx.user.id, ownerId);
    return listWorkoutSummaries(ctx.db, {
      ownerId,
      status: input.status,
      visibleOnly: scope === 'friend',
      cursor: input.cursor,
      limit: input.limit,
    });
  }),

  byId: authedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const doc = await getWorkoutDoc(ctx.db, input.id);
    if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });
    if (!(await canViewWorkout(ctx.db, ctx.user.id, doc))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'This workout is private' });
    }
    return doc;
  }),

  create: authedProcedure.input(workoutInputSchema).mutation(async ({ ctx, input }) => {
    await assertExerciseIdsExist(ctx.db, input);
    const visibility = input.visibility ?? (await defaultVisibilityFor(ctx.db, ctx.user.id));
    const id = await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workouts)
        .values({
          ownerId: ctx.user.id,
          name: input.name,
          notes: input.notes ?? null,
          scheduledFor: input.scheduledFor ?? null,
          visibility,
          status: 'planned',
        })
        .returning({ id: workouts.id });
      await replaceWorkoutChildren(tx, created!.id, input.exercises);
      return created!.id;
    });
    return (await getWorkoutDoc(ctx.db, id))!;
  }),

  update: authedProcedure
    .input(z.object({ id: z.uuid() }).extend(workoutInputSchema.shape))
    .mutation(async ({ ctx, input }) => {
      const row = await loadWorkoutRow(ctx.db, input.id);
      if (row.ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (row.status !== 'planned') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only planned workouts can be edited',
        });
      }
      await assertExerciseIdsExist(ctx.db, input);
      const visibility = input.visibility ?? (await defaultVisibilityFor(ctx.db, ctx.user.id));
      await ctx.db.transaction(async (tx) => {
        await tx
          .update(workouts)
          .set({
            name: input.name,
            notes: input.notes ?? null,
            scheduledFor: input.scheduledFor ?? null,
            visibility,
          })
          .where(eq(workouts.id, input.id));
        await replaceWorkoutChildren(tx, input.id, input.exercises);
      });
      return (await getWorkoutDoc(ctx.db, input.id))!;
    }),

  delete: authedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const row = await loadWorkoutRow(ctx.db, input.id);
    if (row.ownerId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
    await ctx.db.delete(workouts).where(eq(workouts.id, input.id));
  }),

  clone: authedProcedure.input(cloneWorkoutInputSchema).mutation(async ({ ctx, input }) => {
    let sourceId: string;
    let shareLinkId: string | undefined;

    if ('token' in input.source) {
      // The token IS the access grant — bypasses visibility, bumps use_count
      const resolution = await resolveShareToken(ctx.db, input.source.token);
      if (!resolution.ok) {
        if (resolution.reason === 'revoked') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This link was revoked' });
        }
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      sourceId = resolution.workout.id;
      shareLinkId = resolution.link.id;
    } else {
      const source = await loadWorkoutRow(ctx.db, input.source.workoutId);
      if (!(await canViewWorkout(ctx.db, ctx.user.id, source))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This workout is private' });
      }
      sourceId = source.id;
    }

    const visibility = await defaultVisibilityFor(ctx.db, ctx.user.id);
    const cloneId = await cloneWorkout(ctx.db, {
      sourceId,
      newOwnerId: ctx.user.id,
      visibility,
      shareLinkId,
    });
    if (!cloneId) throw new TRPCError({ code: 'NOT_FOUND' });
    return (await getWorkoutDoc(ctx.db, cloneId))!;
  }),
});
