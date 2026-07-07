import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { linkTokenSchema } from '@buddy-pass/shared';
import { and, desc, eq, isNull, schema } from '@buddy-pass/db';
import { resolveShareToken, toSharedWorkoutView } from '../../services/sharing';
import { publicRateLimitedProcedure, registeredProcedure, router } from '../trpc';

const { shareLinks, workouts } = schema;

async function loadOwnedWorkout(
  db: Parameters<typeof resolveShareToken>[0],
  userId: string,
  workoutId: string,
) {
  const [row] = await db.select().from(workouts).where(eq(workouts.id, workoutId));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  if (row.ownerId !== userId) throw new TRPCError({ code: 'FORBIDDEN' });
  return row;
}

export const sharingRouter = router({
  /** Backs /s/:token — the only public procedure (ADR-0001). Non-mutating: use_count bumps on clone. */
  resolve: publicRateLimitedProcedure
    .input(z.object({ token: linkTokenSchema }))
    .query(async ({ ctx, input }) => {
      const resolution = await resolveShareToken(ctx.db, input.token);
      if (!resolution.ok) {
        if (resolution.reason === 'revoked') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'This link was revoked' });
        }
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return { workout: toSharedWorkoutView(resolution.workout), owner: resolution.owner };
    }),

  /** Owner only; idempotent — returns the active link if one exists. */
  create: registeredProcedure
    .input(z.object({ workoutId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await loadOwnedWorkout(ctx.db, ctx.user.id, input.workoutId);
      const [existing] = await ctx.db
        .select()
        .from(shareLinks)
        .where(and(eq(shareLinks.workoutId, input.workoutId), isNull(shareLinks.revokedAt)));
      const link =
        existing ??
        (
          await ctx.db
            .insert(shareLinks)
            .values({ workoutId: input.workoutId, createdBy: ctx.user.id })
            .returning()
        )[0]!;
      return { token: link.token, url: `${ctx.appOrigin}/s/${link.token}` };
    }),

  revoke: registeredProcedure
    .input(z.object({ token: linkTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await ctx.db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.token, input.token));
      if (!link) throw new TRPCError({ code: 'NOT_FOUND' });
      await loadOwnedWorkout(ctx.db, ctx.user.id, link.workoutId);
      if (!link.revokedAt) {
        await ctx.db
          .update(shareLinks)
          .set({ revokedAt: new Date() })
          .where(eq(shareLinks.id, link.id));
      }
    }),

  /** The viral-analytics view — owner only. */
  listForWorkout: registeredProcedure
    .input(z.object({ workoutId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      await loadOwnedWorkout(ctx.db, ctx.user.id, input.workoutId);
      const links = await ctx.db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.workoutId, input.workoutId))
        .orderBy(desc(shareLinks.id));
      return links.map((l) => ({
        token: l.token,
        url: `${ctx.appOrigin}/s/${l.token}`,
        useCount: l.useCount,
        createdAt: l.createdAt,
        revokedAt: l.revokedAt,
      }));
    }),
});
