import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { linkTokenSchema } from '@buddy-pass/shared';
import { and, eq, isNull, or, schema } from '@buddy-pass/db';
import { canonicalPair } from '../../services/access';
import { authedProcedure, authedRateLimitedProcedure, registeredProcedure, router } from '../trpc';

const { userFriends, friendLinks, user } = schema;

/** Invite links only (plans/MVP.md §2): guests may accept, only registered users mint (ADR-0001). */
export const friendsRouter = router({
  /** Not paginated — invite-only friendships stay small. */
  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.userFriends.findMany({
      where: or(eq(userFriends.userId, ctx.user.id), eq(userFriends.friendId, ctx.user.id)),
      with: { user: true, friend: true },
    });
    return rows.map((row) => {
      const other = row.userId === ctx.user.id ? row.friend : row.user;
      return { id: other.id, name: other.name, image: other.image, friendsSince: row.createdAt };
    });
  }),

  /** Idempotent: returns the existing active link if one exists, else mints. */
  createLink: registeredProcedure.mutation(async ({ ctx }) => {
    const [existing] = await ctx.db
      .select()
      .from(friendLinks)
      .where(and(eq(friendLinks.userId, ctx.user.id), isNull(friendLinks.revokedAt)));
    const link =
      existing ??
      (await ctx.db.insert(friendLinks).values({ userId: ctx.user.id }).returning())[0]!;
    return { token: link.token, url: `${ctx.appOrigin}/f/${link.token}` };
  }),

  /** Stops *new* friendships only; existing ones persist. */
  revokeLink: registeredProcedure
    .input(z.object({ token: linkTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await ctx.db
        .select()
        .from(friendLinks)
        .where(eq(friendLinks.token, input.token));
      if (!link) throw new TRPCError({ code: 'NOT_FOUND' });
      if (link.userId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!link.revokedAt) {
        await ctx.db
          .update(friendLinks)
          .set({ revokedAt: new Date() })
          .where(eq(friendLinks.id, link.id));
      }
    }),

  /** Opening a friend link = mutual consent → instant 'accepted' friendship. */
  acceptLink: authedRateLimitedProcedure
    .input(z.object({ token: linkTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const [link] = await ctx.db
        .select()
        .from(friendLinks)
        .where(eq(friendLinks.token, input.token));
      if (!link) throw new TRPCError({ code: 'NOT_FOUND' });
      if (link.revokedAt) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This link was revoked' });
      }
      if (link.userId === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot friend yourself' });
      }

      // Duplicate accepts (and races) collapse into idempotent success
      const [lo, hi] = canonicalPair(ctx.user.id, link.userId);
      await ctx.db
        .insert(userFriends)
        .values({ userId: lo, friendId: hi, status: 'accepted' })
        .onConflictDoNothing();

      const [creator] = await ctx.db
        .select({ id: user.id, name: user.name, image: user.image })
        .from(user)
        .where(eq(user.id, link.userId));
      return { friend: creator! };
    }),

  remove: authedProcedure
    .input(z.object({ friendId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [lo, hi] = canonicalPair(ctx.user.id, input.friendId);
      const deleted = await ctx.db
        .delete(userFriends)
        .where(and(eq(userFriends.userId, lo), eq(userFriends.friendId, hi)))
        .returning({ id: userFriends.id });
      if (deleted.length === 0) throw new TRPCError({ code: 'NOT_FOUND' });
    }),
});
