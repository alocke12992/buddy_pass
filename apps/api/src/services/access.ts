import { TRPCError } from '@trpc/server';
import { and, eq, schema, type Database } from '@buddy-pass/db';

const { userFriends } = schema;

/** Canonical friendship pair: user_id < friend_id (uuid string sort matches pg byte order). */
export function canonicalPair(a: string, b: string) {
  return [a, b].sort() as [string, string];
}

export async function areFriends(db: Database, a: string, b: string) {
  if (a === b) return false;
  const [lo, hi] = canonicalPair(a, b);
  const [row] = await db
    .select({ id: userFriends.id })
    .from(userFriends)
    .where(
      and(
        eq(userFriends.userId, lo),
        eq(userFriends.friendId, hi),
        eq(userFriends.status, 'accepted'),
      ),
    );
  return row !== undefined;
}

/** Owner sees everything; friends see `visibility='friends'`; everyone else nothing. */
export async function canViewWorkout(
  db: Database,
  viewerId: string,
  workout: { ownerId: string; visibility: 'private' | 'friends' },
) {
  if (workout.ownerId === viewerId) return true;
  if (workout.visibility !== 'friends') return false;
  return areFriends(db, viewerId, workout.ownerId);
}

/**
 * Shared access rule for user-scoped reads (`workouts.list`, `stats.*`):
 * self → full access, friend → friends-visible only, anyone else → FORBIDDEN (ADR-0002).
 */
export async function requireUserScope(
  db: Database,
  viewerId: string,
  targetId: string,
): Promise<'self' | 'friend'> {
  if (targetId === viewerId) return 'self';
  if (await areFriends(db, viewerId, targetId)) return 'friend';
  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'You can only view your own or a friend’s data',
  });
}
