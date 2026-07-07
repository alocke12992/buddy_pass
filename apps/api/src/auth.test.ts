import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq, schema } from '@buddy-pass/db';
import {
  createTestApp,
  signInAnonymous,
  signUp,
  trpcMutation,
  trpcQuery,
  type TestApp,
} from './test/harness';

// Auth tiers (ADR-0001) + the guest → registered merge (plans/API.md §4 target 3).

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
}, 120_000);

afterAll(async () => {
  await app?.stop();
});

interface Profile {
  user: { id: string; name: string; isAnonymous: boolean };
  stats: { heightCm: number | null; dateOfBirth: Date | null } | null;
  settings: { defaultWorkoutVisibility: string } | null;
  latestWeighIn: { weightKg: number } | null;
}

describe('sessions and tiers', () => {
  it('registers a user via email/password and resolves the session in tRPC context', async () => {
    const session = await signUp(app.server, { name: 'Reg One', email: 'reg1@test.local' });
    const profile = await trpcQuery<Profile>(app.server, 'profile.get', undefined, session.cookie);
    expect(profile.status).toBe(200);
    expect(profile.data.user).toMatchObject({
      id: session.userId,
      name: 'Reg One',
      isAnonymous: false,
    });
    expect(profile.data.stats).toBeNull(); // onboarding incomplete
    expect(profile.data.settings).toBeNull();
  });

  it('creates anonymous guest sessions with isAnonymous=true', async () => {
    const guest = await signInAnonymous(app.server);
    const profile = await trpcQuery<Profile>(app.server, 'profile.get', undefined, guest.cookie);
    expect(profile.status).toBe(200);
    expect(profile.data.user.isAnonymous).toBe(true);
  });

  it('rejects authed procedures without a session (UNAUTHORIZED)', async () => {
    const res = await trpcQuery(app.server, 'exercises.list');
    expect(res.errorCode).toBe('UNAUTHORIZED');
  });

  it('lets guests use authed procedures but not registered ones (ADR-0001)', async () => {
    const guest = await signInAnonymous(app.server);
    const list = await trpcQuery(app.server, 'exercises.filters', undefined, guest.cookie);
    expect(list.status).toBe(200);

    const mint = await trpcMutation(app.server, 'friends.createLink', undefined, guest.cookie);
    expect(mint.errorCode).toBe('UNAUTHORIZED');
  });

  it('keeps ping public', async () => {
    const res = await trpcQuery<{ pong: boolean; at: Date }>(app.server, 'ping');
    expect(res.status).toBe(200);
    expect(res.data.pong).toBe(true);
    expect(res.data.at).toBeInstanceOf(Date); // superjson round-trip
  });
});

describe('guest → registered merge (better-auth onLinkAccount)', () => {
  it('moves workouts, settings, stats, weigh-ins, and friendships to the new account', async () => {
    // A registered friend mints an invite link
    const inviter = await signUp(app.server, { name: 'Inviter', email: 'inviter@test.local' });
    const link = await trpcMutation<{ token: string }>(
      app.server,
      'friends.createLink',
      undefined,
      inviter.cookie,
    );

    // Guest builds up state: onboarding, a workout, a friendship
    const guest = await signInAnonymous(app.server);
    await trpcMutation(
      app.server,
      'profile.completeOnboarding',
      {
        stats: { heightCm: 172, gender: 'female', dateOfBirth: new Date('1995-03-02T00:00:00Z') },
        settings: {
          unitPreference: 'imperial',
          experienceLevel: 'beginner',
          defaultWorkoutVisibility: 'friends',
        },
        weightKg: 61.5,
      },
      guest.cookie,
    );
    const exercises = await trpcQuery<{ id: string }[]>(
      app.server,
      'exercises.list',
      undefined,
      guest.cookie,
    );
    const workout = await trpcMutation<{ id: string }>(
      app.server,
      'workouts.create',
      {
        name: 'Guest Gains',
        exercises: [
          {
            exerciseId: exercises.data[0]!.id,
            position: 0,
            sets: [{ position: 0, isWarmup: false, reps: 10, weightKg: 40, restSeconds: 60 }],
          },
        ],
      },
      guest.cookie,
    );
    expect(workout.status).toBe(200);
    const accepted = await trpcMutation(
      app.server,
      'friends.acceptLink',
      { token: link.data.token },
      guest.cookie,
    );
    expect(accepted.status).toBe(200);
    const guestFriends = await trpcQuery<{ id: string; friendsSince: Date }[]>(
      app.server,
      'friends.list',
      undefined,
      guest.cookie,
    );
    const friendsSinceAsGuest = guestFriends.data[0]!.friendsSince;

    // Sign up with the guest's session cookie → onLinkAccount merge fires
    const upgraded = await signUp(app.server, {
      name: 'Upgraded',
      email: 'upgraded@test.local',
      cookie: guest.cookie,
    });
    expect(upgraded.userId).not.toBe(guest.userId);

    const profile = await trpcQuery<Profile>(app.server, 'profile.get', undefined, upgraded.cookie);
    expect(profile.data.user.isAnonymous).toBe(false);
    expect(profile.data.settings?.defaultWorkoutVisibility).toBe('friends');
    expect(profile.data.stats?.heightCm).toBe(172);
    expect(profile.data.latestWeighIn?.weightKg).toBe(61.5);

    const workouts = await trpcQuery<{ items: { id: string; name: string; ownerId: string }[] }>(
      app.server,
      'workouts.list',
      {},
      upgraded.cookie,
    );
    expect(workouts.data.items).toHaveLength(1);
    expect(workouts.data.items[0]).toMatchObject({ name: 'Guest Gains', ownerId: upgraded.userId });

    const friends = await trpcQuery<{ id: string; friendsSince: Date }[]>(
      app.server,
      'friends.list',
      undefined,
      upgraded.cookie,
    );
    expect(friends.data.map((f) => f.id)).toEqual([inviter.userId]);
    expect(friends.data[0]!.friendsSince).toEqual(friendsSinceAsGuest); // survives the merge

    // The anonymous user row is deleted by better-auth after linking
    const [guestRows] = await app.db
      .select({ n: count() })
      .from(schema.user)
      .where(eq(schema.user.id, guest.userId));
    expect(guestRows!.n).toBe(0);

    // The guest's old cookie no longer authenticates
    const stale = await trpcQuery(app.server, 'profile.get', undefined, guest.cookie);
    expect(stale.errorCode).toBe('UNAUTHORIZED');
  });
});
