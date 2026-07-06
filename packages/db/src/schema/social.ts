import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';
import { user } from './auth';
import { friendshipStatus } from './enums';
import { id, timestamps } from './helpers';
import { workouts } from './workouts';

export const userFriends = pgTable(
  'user_friends',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    friendId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** MVP always writes 'accepted' (friend link = mutual consent); 'pending' reserved for future search-based requests. */
    status: friendshipStatus().notNull().default('accepted'),
    ...timestamps,
  },
  (t) => [
    // canonical pair ordering makes (userId, friendId) unique cover both directions
    check('user_friends_pair_order', sql`${t.userId} < ${t.friendId}`),
    unique().on(t.userId, t.friendId),
    index().on(t.friendId),
  ],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: id(),
    workoutId: uuid()
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    token: text()
      .notNull()
      .unique()
      .$defaultFn(() => nanoid(12)),
    createdBy: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Clone attributions — viral analytics. */
    useCount: integer().notNull().default(0),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.workoutId)],
);

export const friendLinks = pgTable('friend_links', {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text()
    .notNull()
    .unique()
    .$defaultFn(() => nanoid(12)),
  revokedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});
