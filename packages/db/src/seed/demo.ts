import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import {
  account,
  bodyMeasurements,
  exercises,
  friendLinks,
  shareLinks,
  user,
  userFriends,
  userSettings,
  userStats,
  workoutExercises,
  workouts,
  workoutSets,
} from '../schema/index';

const DEMO_EMAIL = 'demo@buddypass.local';
const BUDDY_EMAIL = 'buddy@buddypass.local';
const DEMO_SHARE_TOKEN = 'demoshare123';
const DEMO_FRIEND_TOKEN = 'demofriend123';
// better-auth scrypt hash of 'demo1234', pre-computed so the seed needs no
// better-auth dependency. Coupled to better-auth's hash params — regenerate on
// upgrade with:
//   cd apps/api && pnpm exec tsx -e \
//     "import('better-auth/crypto').then(async (m) => console.log(await m.hashPassword('demo1234')))"
const DEMO_PASSWORD_HASH =
  '7128ef4fec1d8519009010af835593e3:524512551c890b29e876c96bb2bacd0a565ea87904c4b69dd4ce3b36543a11466032daa92fe1e408d660150b503c31a140b50dd80bfd2072a400a65904af96b8';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

/** Deterministic pick: first N compound exercises for a force, barbell/dumbbell only. */
async function pickExercises(db: Database, force: 'push' | 'pull', count: number) {
  return db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(eq(exercises.force, force), eq(exercises.mechanic, 'compound')))
    .orderBy(asc(exercises.slug))
    .limit(count);
}

async function insertWorkoutWithSets(
  db: Database,
  ownerId: string,
  opts: {
    name: string;
    exerciseIds: string[];
    status: 'planned' | 'completed';
    startedAt?: Date;
    endedAt?: Date;
    notes?: string;
    baseWeightKg: number;
  },
) {
  const [workout] = await db
    .insert(workouts)
    .values({
      ownerId,
      name: opts.name,
      status: opts.status,
      visibility: 'friends',
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
      notes: opts.notes,
    })
    .returning({ id: workouts.id });

  for (const [i, exerciseId] of opts.exerciseIds.entries()) {
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: workout!.id, exerciseId, position: i })
      .returning({ id: workoutExercises.id });

    await db.insert(workoutSets).values(
      Array.from({ length: 3 }, (_, setIdx) => ({
        workoutExerciseId: we!.id,
        position: setIdx,
        isWarmup: setIdx === 0,
        reps: setIdx === 0 ? 12 : 8,
        weightKg: opts.baseWeightKg + i * 10 + (setIdx === 0 ? -10 : setIdx * 2.5),
        restSeconds: 90,
        completedAt:
          opts.status === 'completed' && opts.startedAt
            ? new Date(opts.startedAt.getTime() + (i * 3 + setIdx + 1) * 4 * 60 * 1000)
            : null,
      })),
    );
  }

  return workout!.id;
}

/**
 * Credential account (better-auth shape: providerId 'credential', accountId = user id)
 * so `demo@buddypass.local` / `demo1234` is a real login, plus the stable
 * `demofriend123` invite link. Idempotent on its own so it also heals dev
 * databases seeded before the demo login existed (plans/WEB.md milestone 0).
 */
async function ensureDemoLogin(db: Database, demoId: string) {
  const creds = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, demoId), eq(account.providerId, 'credential')));
  if (creds.length === 0) {
    await db.insert(account).values({
      userId: demoId,
      accountId: demoId,
      providerId: 'credential',
      password: DEMO_PASSWORD_HASH,
    });
  }
  await db
    .insert(friendLinks)
    .values({ userId: demoId, token: DEMO_FRIEND_TOKEN })
    .onConflictDoNothing();
}

/** Local-dev demo data; skipped (but login-healed) if the demo user already exists. */
export async function seedDemo(db: Database) {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, DEMO_EMAIL));
  if (existing.length > 0) {
    await ensureDemoLogin(db, existing[0]!.id);
    return { created: false };
  }

  const [demo] = await db
    .insert(user)
    .values({ name: 'Demo Buddy', email: DEMO_EMAIL, emailVerified: true })
    .returning({ id: user.id });
  const [buddy] = await db
    .insert(user)
    .values({ name: 'Workout Buddy', email: BUDDY_EMAIL, emailVerified: true })
    .returning({ id: user.id });
  const demoId = demo!.id;
  const buddyId = buddy!.id;

  await ensureDemoLogin(db, demoId);

  await db.insert(userSettings).values({
    userId: demoId,
    unitPreference: 'imperial',
    experienceLevel: 'intermediate',
    defaultWorkoutVisibility: 'friends',
  });
  await db.insert(userStats).values({
    userId: demoId,
    heightCm: 180,
    gender: 'male',
    dateOfBirth: '1992-05-14',
  });
  await db.insert(bodyMeasurements).values(
    [28, 21, 14, 7, 0].map((n, i) => ({
      userId: demoId,
      weightKg: 88.5 - i * 0.4,
      measuredAt: daysAgo(n),
    })),
  );

  // canonical pair ordering (user_id < friend_id) — uuid string compare matches pg byte order
  const [a, b] = [demoId, buddyId].sort();
  await db.insert(userFriends).values({ userId: a!, friendId: b!, status: 'accepted' });

  const pushExercises = await pickExercises(db, 'push', 3);
  const pullExercises = await pickExercises(db, 'pull', 3);

  await insertWorkoutWithSets(db, demoId, {
    name: 'Push Day',
    exerciseIds: pushExercises.map((e) => e.id),
    status: 'completed',
    startedAt: new Date(daysAgo(1).getTime() - 60 * 60 * 1000),
    endedAt: daysAgo(1),
    notes: 'Felt strong today.',
    baseWeightKg: 60,
  });

  const plannedId = await insertWorkoutWithSets(db, demoId, {
    name: 'Pull Day',
    exerciseIds: pullExercises.map((e) => e.id),
    status: 'planned',
    baseWeightKg: 50,
  });

  await db.insert(shareLinks).values({
    workoutId: plannedId,
    token: DEMO_SHARE_TOKEN,
    createdBy: demoId,
  });

  return { created: true, demoUserId: demoId, sharedWorkoutId: plannedId };
}
