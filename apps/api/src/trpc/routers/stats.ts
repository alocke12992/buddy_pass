import { z } from 'zod';
import { dateRangeInputSchema, volumeOverTimeInputSchema } from '@buddy-pass/shared';
import { requireUserScope } from '../../services/access';
import { bodyWeightSeries, statsSummary, volumeOverTime } from '../../services/stats';
import { authedProcedure, router } from '../trpc';

/**
 * Chart-ready read models (plans/API.md §2.7). `userId` omitted = self; a friend
 * sees numbers derived only from friends-visible workouts; anyone else → FORBIDDEN.
 */
export const statsRouter = router({
  volumeOverTime: authedProcedure.input(volumeOverTimeInputSchema).query(async ({ ctx, input }) => {
    const ownerId = input.userId ?? ctx.user.id;
    const scope = await requireUserScope(ctx.db, ctx.user.id, ownerId);
    return volumeOverTime(ctx.db, {
      ownerId,
      visibleOnly: scope === 'friend',
      bucket: input.bucket,
      from: input.from,
      to: input.to,
    });
  }),

  /** Self only — body weight is never shared in MVP. */
  bodyWeight: authedProcedure
    .input(dateRangeInputSchema)
    .query(({ ctx, input }) =>
      bodyWeightSeries(ctx.db, { userId: ctx.user.id, from: input.from, to: input.to }),
    ),

  summary: authedProcedure
    .input(z.object({ userId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const ownerId = input?.userId ?? ctx.user.id;
      const scope = await requireUserScope(ctx.db, ctx.user.id, ownerId);
      return statsSummary(ctx.db, { ownerId, visibleOnly: scope === 'friend' });
    }),
});
