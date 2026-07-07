import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  getExerciseDetail,
  listExerciseFilters,
  listExerciseIndex,
} from '../../services/exercises';
import { authedProcedure, router } from '../trpc';

/** Library reads (seeded, read-only). Full index + lazy detail — no server-side search (plans/API.md §2.1). */
export const exercisesRouter = router({
  list: authedProcedure.query(({ ctx }) => listExerciseIndex(ctx.db)),

  byId: authedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const detail = await getExerciseDetail(ctx.db, input.id);
    if (!detail) throw new TRPCError({ code: 'NOT_FOUND' });
    return detail;
  }),

  filters: authedProcedure.query(({ ctx }) => listExerciseFilters(ctx.db)),
});
