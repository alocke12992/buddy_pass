import { eq, or, schema, type Database } from '@buddy-pass/db';

const {
  workouts,
  shareLinks,
  friendLinks,
  bodyMeasurements,
  userSettings,
  userStats,
  userFriends,
} = schema;

/**
 * Reassign a guest's rows to the account they just registered (plans/MVP.md §5
 * step 6). Runs inside better-auth's anonymous onLinkAccount hook, before the
 * guest user row is deleted (session/account rows cascade with that delete).
 */
export async function mergeGuestData(db: Database, guestId: string, targetId: string) {
  if (guestId === targetId) return;

  await db.transaction(async (tx) => {
    await tx.update(workouts).set({ ownerId: targetId }).where(eq(workouts.ownerId, guestId));
    await tx
      .update(bodyMeasurements)
      .set({ userId: targetId })
      .where(eq(bodyMeasurements.userId, guestId));
    // Guests cannot mint links (ADR-0001) so these are no-ops today — kept so the
    // merge stays correct if minting rules ever loosen.
    await tx
      .update(shareLinks)
      .set({ createdBy: targetId })
      .where(eq(shareLinks.createdBy, guestId));
    await tx.update(friendLinks).set({ userId: targetId }).where(eq(friendLinks.userId, guestId));

    // Singleton rows: move unless the target already has one (fresh signups never do).
    for (const table of [userSettings, userStats] as const) {
      const [existing] = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.userId, targetId));
      if (existing) await tx.delete(table).where(eq(table.userId, guestId));
      else await tx.update(table).set({ userId: targetId }).where(eq(table.userId, guestId));
    }

    // Friendships: delete + reinsert with the canonical pair order (user_id < friend_id),
    // deduping against friendships the target already has.
    const friendships = await tx
      .select()
      .from(userFriends)
      .where(or(eq(userFriends.userId, guestId), eq(userFriends.friendId, guestId)));
    for (const row of friendships) {
      const other = row.userId === guestId ? row.friendId : row.userId;
      await tx.delete(userFriends).where(eq(userFriends.id, row.id));
      if (other === targetId) continue;
      const [lo, hi] = [other, targetId].sort() as [string, string];
      await tx
        .insert(userFriends)
        .values({ userId: lo, friendId: hi, status: row.status })
        .onConflictDoNothing();
    }
  });
}
