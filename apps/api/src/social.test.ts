import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, schema } from '@buddy-pass/db';
import { buildServer } from './server';
import {
  createTestApp,
  signInAnonymous,
  signUp,
  trpcMutation,
  trpcQuery,
  type Session,
  type TestApp,
} from './test/harness';

// The social loop (plans/API.md §4 targets 1, 2, 5): friend links, visibility,
// share → clone semantics, stats privacy, plus the plain HTTP link routes.

let app: TestApp;
let alice: Session; // owner
let ben: Session; //  friend of alice
let cara: Session; // stranger
let exerciseIds: string[];

interface WorkoutDoc {
  id: string;
  name: string;
  status: string;
  visibility: string;
  ownerId: string;
  originWorkoutId: string | null;
  scheduledFor: Date | null;
  exerciseCount: number;
  setCount: number;
  exercises: {
    id: string;
    sets: {
      id: string;
      completedAt: Date | null;
      reps: number;
      weightKg: number | null;
      isWarmup: boolean;
    }[];
  }[];
}

async function createWorkout(
  session: Session,
  name: string,
  opts: {
    visibility?: 'private' | 'friends';
    sets?: { reps: number; weightKg: number; isWarmup?: boolean }[];
  } = {},
) {
  const sets = opts.sets ?? [
    { reps: 10, weightKg: 20, isWarmup: true },
    { reps: 8, weightKg: 100 },
    { reps: 8, weightKg: 100 },
  ];
  const res = await trpcMutation<WorkoutDoc>(
    app.server,
    'workouts.create',
    {
      name,
      visibility: opts.visibility,
      scheduledFor: new Date('2026-08-01T09:00:00Z'),
      exercises: [
        {
          exerciseId: exerciseIds[0],
          position: 0,
          sets: sets.map((s, i) => ({
            position: i,
            isWarmup: s.isWarmup ?? false,
            reps: s.reps,
            weightKg: s.weightKg,
            restSeconds: 90,
          })),
        },
      ],
    },
    session.cookie,
  );
  expect(res.status).toBe(200);
  return res.data;
}

/** start → complete every set → finish. */
async function logToCompletion(
  session: Session,
  doc: WorkoutDoc,
  opts: { skipSets?: number } = {},
) {
  await trpcMutation(app.server, 'logging.start', { workoutId: doc.id }, session.cookie);
  const setIds = doc.exercises.flatMap((e) => e.sets.map((s) => s.id));
  const toComplete = opts.skipSets ? setIds.slice(0, -opts.skipSets) : setIds;
  for (const setId of toComplete) {
    await trpcMutation(app.server, 'logging.completeSet', { setId }, session.cookie);
  }
  await trpcMutation(app.server, 'logging.finish', { workoutId: doc.id }, session.cookie);
}

beforeAll(async () => {
  app = await createTestApp();
  alice = await signUp(app.server, { name: 'Alice Owner', email: 'alice@social.local' });
  ben = await signUp(app.server, { name: 'Ben Friend', email: 'ben@social.local' });
  cara = await signUp(app.server, { name: 'Cara Stranger', email: 'cara@social.local' });
  const list = await trpcQuery<{ id: string }[]>(
    app.server,
    'exercises.list',
    undefined,
    alice.cookie,
  );
  exerciseIds = list.data.slice(0, 3).map((e) => e.id);
}, 120_000);

afterAll(async () => {
  await app?.stop();
});

describe('friend links', () => {
  let token: string;

  it('mints idempotently for registered users', async () => {
    const first = await trpcMutation<{ token: string; url: string }>(
      app.server,
      'friends.createLink',
      undefined,
      alice.cookie,
    );
    const second = await trpcMutation<{ token: string }>(
      app.server,
      'friends.createLink',
      undefined,
      alice.cookie,
    );
    expect(first.data.token).toBe(second.data.token);
    expect(first.data.url).toBe(`http://localhost:5173/f/${first.data.token}`);
    token = first.data.token;
  });

  it('rejects self-friending and unknown tokens', async () => {
    const self = await trpcMutation(app.server, 'friends.acceptLink', { token }, alice.cookie);
    expect(self.errorCode).toBe('BAD_REQUEST');

    const unknown = await trpcMutation(
      app.server,
      'friends.acceptLink',
      { token: 'nosuchtoken1' },
      ben.cookie,
    );
    expect(unknown.errorCode).toBe('NOT_FOUND');
  });

  it('accepting writes the mutual friendship; accepting twice is idempotent', async () => {
    const first = await trpcMutation<{ friend: { id: string; name: string } }>(
      app.server,
      'friends.acceptLink',
      { token },
      ben.cookie,
    );
    expect(first.data.friend).toMatchObject({ id: alice.userId, name: 'Alice Owner' });

    const again = await trpcMutation<{ friend: { id: string } }>(
      app.server,
      'friends.acceptLink',
      { token },
      ben.cookie,
    );
    expect(again.status).toBe(200);

    const friendships = await app.db
      .select()
      .from(schema.userFriends)
      .where(eq(schema.userFriends.status, 'accepted'));
    expect(friendships).toHaveLength(1); // no duplicate row

    const aliceFriends = await trpcQuery<{ id: string; friendsSince: Date }[]>(
      app.server,
      'friends.list',
      undefined,
      alice.cookie,
    );
    expect(aliceFriends.data.map((f) => f.id)).toEqual([ben.userId]);
    expect(aliceFriends.data[0]!.friendsSince).toBeInstanceOf(Date);
  });

  it('revoked links stop new friendships (FORBIDDEN), not existing ones', async () => {
    await trpcMutation(app.server, 'friends.revokeLink', { token }, alice.cookie);
    const res = await trpcMutation(app.server, 'friends.acceptLink', { token }, cara.cookie);
    expect(res.errorCode).toBe('FORBIDDEN');

    const stillFriends = await trpcQuery<{ id: string }[]>(
      app.server,
      'friends.list',
      undefined,
      ben.cookie,
    );
    expect(stillFriends.data.map((f) => f.id)).toEqual([alice.userId]);
  });
});

describe('visibility (ADR-0002: FORBIDDEN vs NOT_FOUND)', () => {
  let friendsWorkout: WorkoutDoc;
  let privateWorkout: WorkoutDoc;

  beforeAll(async () => {
    friendsWorkout = await createWorkout(alice, 'Shared With Friends', { visibility: 'friends' });
    privateWorkout = await createWorkout(alice, 'My Secret', { visibility: 'private' });
  });

  it('friends see only friends-visible workouts in lists', async () => {
    const res = await trpcQuery<{ items: { name: string }[] }>(
      app.server,
      'workouts.list',
      { ownerId: alice.userId },
      ben.cookie,
    );
    expect(res.data.items.map((w) => w.name)).toEqual(['Shared With Friends']);
  });

  it('byId: friend on private → FORBIDDEN; stranger on anything → FORBIDDEN; unknown → NOT_FOUND', async () => {
    const friendVisible = await trpcQuery(
      app.server,
      'workouts.byId',
      { id: friendsWorkout.id },
      ben.cookie,
    );
    expect(friendVisible.status).toBe(200);

    const friendPrivate = await trpcQuery(
      app.server,
      'workouts.byId',
      { id: privateWorkout.id },
      ben.cookie,
    );
    expect(friendPrivate.errorCode).toBe('FORBIDDEN');

    const strangerList = await trpcQuery(
      app.server,
      'workouts.list',
      { ownerId: alice.userId },
      cara.cookie,
    );
    expect(strangerList.errorCode).toBe('FORBIDDEN');

    const strangerView = await trpcQuery(
      app.server,
      'workouts.byId',
      { id: friendsWorkout.id },
      cara.cookie,
    );
    expect(strangerView.errorCode).toBe('FORBIDDEN');

    const unknown = await trpcQuery(
      app.server,
      'workouts.byId',
      { id: '00000000-0000-7000-8000-000000000000' },
      ben.cookie,
    );
    expect(unknown.errorCode).toBe('NOT_FOUND');
  });
});

describe('share links + clone (the growth loop)', () => {
  let sourceDoc: WorkoutDoc;
  let token: string;

  beforeAll(async () => {
    // A completed workout with completed sets — clones must reset all of that
    sourceDoc = await createWorkout(alice, 'Viral Workout', { visibility: 'friends' });
    await logToCompletion(alice, sourceDoc);
  });

  it('sharing.create is owner-only and idempotent', async () => {
    const notOwner = await trpcMutation(
      app.server,
      'sharing.create',
      { workoutId: sourceDoc.id },
      ben.cookie,
    );
    expect(notOwner.errorCode).toBe('FORBIDDEN');

    const first = await trpcMutation<{ token: string; url: string }>(
      app.server,
      'sharing.create',
      { workoutId: sourceDoc.id },
      alice.cookie,
    );
    const second = await trpcMutation<{ token: string }>(
      app.server,
      'sharing.create',
      { workoutId: sourceDoc.id },
      alice.cookie,
    );
    expect(first.data.token).toBe(second.data.token);
    expect(first.data.url).toBe(`http://localhost:5173/s/${first.data.token}`);
    token = first.data.token;
  });

  it('resolve is public, read-only, and never leaks completion state', async () => {
    const res = await trpcQuery<{
      workout: {
        name: string;
        exerciseCount: number;
        exercises: { sets: Record<string, unknown>[] }[];
      };
      owner: { name: string };
    }>(app.server, 'sharing.resolve', { token }); // no cookie
    expect(res.status).toBe(200);
    expect(res.data.workout.name).toBe('Viral Workout');
    expect(res.data.workout.exerciseCount).toBe(1);
    expect(res.data.owner.name).toBe('Alice Owner');
    for (const set of res.data.workout.exercises.flatMap((e) => e.sets)) {
      expect(set).not.toHaveProperty('completedAt');
    }

    const [link] = await app.db
      .select()
      .from(schema.shareLinks)
      .where(eq(schema.shareLinks.token, token));
    expect(link!.useCount).toBe(0); // viewing does not count as use
  });

  it('guests clone via token: fresh planned copy, cloner default visibility, use_count bumped', async () => {
    const guest = await signInAnonymous(app.server);
    const clone = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.clone',
      { source: { token } },
      guest.cookie,
    );
    expect(clone.status).toBe(200);
    expect(clone.data).toMatchObject({
      name: 'Viral Workout',
      status: 'planned',
      visibility: 'private', // guest has no settings → default, never the source's 'friends'
      ownerId: guest.userId,
      originWorkoutId: sourceDoc.id,
      scheduledFor: null,
      setCount: 3,
    });
    for (const set of clone.data.exercises.flatMap((e) => e.sets)) {
      expect(set.completedAt).toBeNull(); // completed_at never copied
    }

    const [link] = await app.db
      .select()
      .from(schema.shareLinks)
      .where(eq(schema.shareLinks.token, token));
    expect(link!.useCount).toBe(1);
  });

  it('clones via workoutId under normal visibility rules', async () => {
    const friendClone = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.clone',
      { source: { workoutId: sourceDoc.id } },
      ben.cookie,
    );
    expect(friendClone.data.ownerId).toBe(ben.userId);

    const strangerClone = await trpcMutation(
      app.server,
      'workouts.clone',
      { source: { workoutId: sourceDoc.id } },
      cara.cookie,
    );
    expect(strangerClone.errorCode).toBe('FORBIDDEN');

    const repeat = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.clone',
      { source: { workoutId: sourceDoc.id } },
      alice.cookie,
    );
    expect(repeat.data).toMatchObject({ ownerId: alice.userId, originWorkoutId: sourceDoc.id });
  });

  it('unknown token → NOT_FOUND; revoked → FORBIDDEN for resolve and clone', async () => {
    const unknown = await trpcQuery(app.server, 'sharing.resolve', { token: 'nosuchtoken1' });
    expect(unknown.errorCode).toBe('NOT_FOUND');

    await trpcMutation(app.server, 'sharing.revoke', { token }, alice.cookie);

    const resolved = await trpcQuery(app.server, 'sharing.resolve', { token });
    expect(resolved.errorCode).toBe('FORBIDDEN');

    const guest = await signInAnonymous(app.server);
    const clone = await trpcMutation(
      app.server,
      'workouts.clone',
      { source: { token } },
      guest.cookie,
    );
    expect(clone.errorCode).toBe('FORBIDDEN');

    const links = await trpcQuery<{ token: string; useCount: number; revokedAt: Date | null }[]>(
      app.server,
      'sharing.listForWorkout',
      { workoutId: sourceDoc.id },
      alice.cookie,
    );
    expect(links.data).toHaveLength(1);
    expect(links.data[0]).toMatchObject({ token, useCount: 1 });
    expect(links.data[0]!.revokedAt).toBeInstanceOf(Date);
  });
});

describe('stats privacy (derived numbers never leak private workouts)', () => {
  beforeAll(async () => {
    // Friends-visible: warmup 10×20 (excluded) + 2 completed 8×100 + 1 skipped
    const visible = await createWorkout(alice, 'Counted', {
      visibility: 'friends',
      sets: [
        { reps: 10, weightKg: 20, isWarmup: true },
        { reps: 8, weightKg: 100 },
        { reps: 8, weightKg: 100 },
        { reps: 8, weightKg: 100 },
      ],
    });
    await logToCompletion(alice, visible, { skipSets: 1 }); // volume: 2 × 800 = 1600

    // Private: must appear in self stats only
    const secret = await createWorkout(alice, 'Hidden Volume', {
      visibility: 'private',
      sets: [{ reps: 10, weightKg: 50 }],
    });
    await logToCompletion(alice, secret); // volume: 500
  });

  it('self sees everything; friend sees only friends-visible volume; stranger is FORBIDDEN', async () => {
    const self = await trpcQuery<{
      workoutsCompleted: number;
      totalVolumeKg: number;
      currentWeekCount: number;
      topMuscleGroups: { name: string; setCount: number }[];
      memberSince: Date;
    }>(app.server, 'stats.summary', {}, alice.cookie);
    // 'Viral Workout' (1600) + 'Counted' (1600) + 'Hidden Volume' (500)
    expect(self.data.workoutsCompleted).toBe(3);
    expect(self.data.totalVolumeKg).toBe(3700);
    expect(self.data.currentWeekCount).toBe(3);
    expect(self.data.topMuscleGroups.length).toBeGreaterThan(0);
    expect(self.data.memberSince).toBeInstanceOf(Date);

    const asFriend = await trpcQuery<{ workoutsCompleted: number; totalVolumeKg: number }>(
      app.server,
      'stats.summary',
      { userId: alice.userId },
      ben.cookie,
    );
    expect(asFriend.data.workoutsCompleted).toBe(2); // private one excluded
    expect(asFriend.data.totalVolumeKg).toBe(3200);

    const asStranger = await trpcQuery(
      app.server,
      'stats.summary',
      { userId: alice.userId },
      cara.cookie,
    );
    expect(asStranger.errorCode).toBe('FORBIDDEN');
  });

  it('volumeOverTime buckets completed volume, warmups and skipped sets excluded', async () => {
    const res = await trpcQuery<
      { bucketStart: Date; totalVolumeKg: number; workoutCount: number }[]
    >(app.server, 'stats.volumeOverTime', { bucket: 'week' }, alice.cookie);
    expect(res.data).toHaveLength(1); // everything logged this week
    expect(res.data[0]!.totalVolumeKg).toBe(3700);
    expect(res.data[0]!.workoutCount).toBe(3);
    expect(res.data[0]!.bucketStart).toBeInstanceOf(Date);

    const asFriend = await trpcQuery<{ totalVolumeKg: number; workoutCount: number }[]>(
      app.server,
      'stats.volumeOverTime',
      { userId: alice.userId, bucket: 'week' },
      ben.cookie,
    );
    expect(asFriend.data[0]!.totalVolumeKg).toBe(3200);
    expect(asFriend.data[0]!.workoutCount).toBe(2);
  });

  it('bodyWeight is a self-only series', async () => {
    await trpcMutation(
      app.server,
      'profile.logWeight',
      { weightKg: 90, measuredAt: new Date('2026-07-01T08:00:00Z') },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'profile.logWeight',
      { weightKg: 89.5, measuredAt: new Date('2026-07-05T08:00:00Z') },
      alice.cookie,
    );
    const res = await trpcQuery<{ weightKg: number; measuredAt: Date }[]>(
      app.server,
      'stats.bodyWeight',
      {},
      alice.cookie,
    );
    expect(res.data.map((m) => m.weightKg)).toEqual([90, 89.5]); // ascending by time

    const bens = await trpcQuery<{ weightKg: number }[]>(
      app.server,
      'stats.bodyWeight',
      {},
      ben.cookie,
    );
    expect(bens.data).toHaveLength(0); // no userId input — always self
  });
});

describe('friends.remove ends visibility', () => {
  it('after removal the ex-friend is a stranger again', async () => {
    await trpcMutation(app.server, 'friends.remove', { friendId: alice.userId }, ben.cookie);

    const list = await trpcQuery(
      app.server,
      'workouts.list',
      { ownerId: alice.userId },
      ben.cookie,
    );
    expect(list.errorCode).toBe('FORBIDDEN');

    const again = await trpcMutation(
      app.server,
      'friends.remove',
      { friendId: alice.userId },
      ben.cookie,
    );
    expect(again.errorCode).toBe('NOT_FOUND');
  });
});

describe('plain HTTP link routes', () => {
  it('GET /s/:token renders OG meta for crawlers and bootstraps the SPA', async () => {
    const doc = await createWorkout(alice, 'OG & <Escaped> Day', { visibility: 'private' });
    const share = await trpcMutation<{ token: string }>(
      app.server,
      'sharing.create',
      { workoutId: doc.id },
      alice.cookie,
    );

    const res = await app.server.inject({ method: 'GET', url: `/s/${share.data.token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('OG &amp; &lt;Escaped&gt; Day — Buddy Pass');
    expect(res.body).toContain('1 exercise · shared by Alice Owner');
    expect(res.body).toContain(`/share/${share.data.token}`);

    const unknown = await app.server.inject({ method: 'GET', url: '/s/nosuchtoken1' });
    expect(unknown.statusCode).toBe(404);

    await trpcMutation(app.server, 'sharing.revoke', { token: share.data.token }, alice.cookie);
    const revoked = await app.server.inject({ method: 'GET', url: `/s/${share.data.token}` });
    expect(revoked.statusCode).toBe(410);
    expect(revoked.body).toContain('revoked');
  });

  it('GET /f/:token redirects into the SPA', async () => {
    const res = await app.server.inject({ method: 'GET', url: '/f/sometoken123' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/friend/sometoken123');
  });
});

describe('rate limiting on token-guessing surfaces', () => {
  it('sharing.resolve trips TOO_MANY_REQUESTS past the fixed window', async () => {
    // Second server on the same database with a tiny limit
    const limited = buildServer({
      logger: false,
      databaseUrl: app.databaseUrl,
      trpcRateLimit: { max: 3, windowMs: 60_000 },
    });
    await limited.ready();
    try {
      for (let i = 0; i < 3; i++) {
        const res = await trpcQuery(limited, 'sharing.resolve', { token: 'guessing12' });
        expect(res.errorCode).toBe('NOT_FOUND'); // wrong token, but not throttled yet
      }
      const throttled = await trpcQuery(limited, 'sharing.resolve', { token: 'guessing12' });
      expect(throttled.errorCode).toBe('TOO_MANY_REQUESTS');
    } finally {
      await limited.close();
    }
  });
});
