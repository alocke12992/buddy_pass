import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { count, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Database } from './client';
import {
  bodyMeasurements,
  equipments,
  exercises,
  shareLinks,
  user,
  userFriends,
  workoutExercises,
  workouts,
  workoutSets,
} from './schema/index';
import { seedDemo } from './seed/demo';
import { seedLibrary } from './seed/library';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

let container: StartedPostgreSqlContainer;
let db: Database;
let pool: ReturnType<typeof createDb>['pool'];

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  ({ db, pool } = createDb(container.getConnectionUri()));
  await migrate(db, { migrationsFolder: MIGRATIONS });
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('migrations + library seed', () => {
  it('seeds the full library and is idempotent', async () => {
    const first = await seedLibrary(db);
    expect(first.exercises).toBe(873);
    expect(first.equipments).toBe(12);
    expect(first.muscleGroups).toBe(17);
    expect(first.exerciseMuscles).toBeGreaterThan(800);

    const second = await seedLibrary(db);
    expect(second).toEqual(first);

    const [row] = await db.select({ value: count() }).from(exercises);
    expect(row!.value).toBe(873);
  });

  it('maps a known exercise with equipment and muscle roles', async () => {
    const row = await db.query.exercises.findFirst({
      where: eq(exercises.slug, 'Alternate_Incline_Dumbbell_Curl'),
      with: { equipment: true, muscles: { with: { muscleGroup: true } } },
    });

    expect(row).toBeDefined();
    expect(row!.name).toBe('Alternate Incline Dumbbell Curl');
    expect(row!.level).toBe('beginner');
    expect(row!.force).toBe('pull');
    expect(row!.equipment?.name).toBe('dumbbell');
    expect(row!.instructions.length).toBeGreaterThan(0);
    expect(row!.images.length).toBeGreaterThan(0);

    const names = (role: string) =>
      row!.muscles.filter((m) => m.role === role).map((m) => m.muscleGroup.name);
    expect(names('primary')).toEqual(['biceps']);
    expect(names('secondary')).toEqual(['forearms']);
  });

  it('generates UUIDv7 primary keys', async () => {
    const [row] = await db.select({ id: equipments.id }).from(equipments).limit(1);
    expect(row!.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });
});

describe('demo seed', () => {
  it('creates demo data once, then no-ops', async () => {
    const first = await seedDemo(db);
    expect(first.created).toBe(true);

    const second = await seedDemo(db);
    expect(second.created).toBe(false);

    const demoWorkouts = await db.query.workouts.findMany({
      with: { exercises: { with: { sets: true, exercise: true } } },
    });
    expect(demoWorkouts).toHaveLength(2);
    for (const w of demoWorkouts) {
      expect(w.exercises).toHaveLength(3);
      expect(w.exercises.flatMap((e) => e.sets)).toHaveLength(9);
    }

    const completed = demoWorkouts.find((w) => w.status === 'completed');
    expect(completed?.exercises.flatMap((e) => e.sets).every((s) => s.completedAt)).toBe(true);

    const [link] = await db.select().from(shareLinks);
    expect(link!.token).toBe('demoshare123');
  });

  it('weight comes back as a number (numeric mode)', async () => {
    const [m] = await db.select().from(bodyMeasurements).limit(1);
    expect(typeof m!.weightKg).toBe('number');
    const [s] = await db.select().from(workoutSets).limit(1);
    expect(typeof s!.weightKg).toBe('number');
  });
});

describe('constraints', () => {
  it('rejects friendships that violate canonical pair ordering', async () => {
    const [u1] = await db
      .insert(user)
      .values({ name: 'A', email: 'a@test.local' })
      .returning({ id: user.id });
    const [u2] = await db
      .insert(user)
      .values({ name: 'B', email: 'b@test.local' })
      .returning({ id: user.id });
    const [lo, hi] = [u1!.id, u2!.id].sort();

    await expect(
      db.insert(userFriends).values({ userId: hi!, friendId: lo! }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'user_friends_pair_order' }),
    });

    await db.insert(userFriends).values({ userId: lo!, friendId: hi! });
    await expect(
      db.insert(userFriends).values({ userId: lo!, friendId: hi! }),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({ constraint: 'user_friends_userId_friendId_unique' }),
    });
  });

  it('cascades user deletion through workouts and sets', async () => {
    const [u] = await db
      .insert(user)
      .values({ name: 'Doomed', email: 'doomed@test.local' })
      .returning({ id: user.id });
    const [ex] = await db.select({ id: exercises.id }).from(exercises).limit(1);
    const [w] = await db.insert(workouts).values({ ownerId: u!.id }).returning({ id: workouts.id });
    const [we] = await db
      .insert(workoutExercises)
      .values({ workoutId: w!.id, exerciseId: ex!.id, position: 0 })
      .returning({ id: workoutExercises.id });
    await db.insert(workoutSets).values({
      workoutExerciseId: we!.id,
      position: 0,
      reps: 10,
      weightKg: 42.5,
    });

    await db.delete(user).where(eq(user.id, u!.id));
    const orphans = await db.select().from(workouts).where(eq(workouts.ownerId, u!.id));
    expect(orphans).toHaveLength(0);
  });
});
