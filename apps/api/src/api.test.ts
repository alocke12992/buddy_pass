import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  signUp,
  trpcMutation,
  trpcQuery,
  type Session,
  type TestApp,
} from './test/harness';

// Core surface: exercise library reads, document-style builder CRUD, the logging
// state machine (plans/API.md §4 target 4), and profile/onboarding.

let app: TestApp;
let alice: Session;
let bob: Session;
let exerciseIds: string[];

interface ExerciseEntry {
  id: string;
  slug: string;
  name: string;
  level: string;
  category: string;
  equipment: { id: string; name: string } | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  thumbnail: string | null;
}

interface SetOut {
  id: string;
  position: number;
  isWarmup: boolean;
  reps: number;
  weightKg: number | null;
  restSeconds: number;
  completedAt: Date | null;
}

interface WorkoutDoc {
  id: string;
  name: string;
  status: string;
  visibility: string;
  ownerId: string;
  originWorkoutId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  notes: string | null;
  exerciseCount: number;
  setCount: number;
  exercises: {
    id: string;
    position: number;
    superSetId: string | null;
    droppedAt: Date | null;
    exercise: ExerciseEntry;
    sets: SetOut[];
  }[];
}

const workoutInput = (name: string, opts: { visibility?: string; sets?: number } = {}) => ({
  name,
  visibility: opts.visibility,
  exercises: exerciseIds.slice(0, 2).map((exerciseId, i) => ({
    exerciseId,
    position: i,
    sets: Array.from({ length: opts.sets ?? 2 }, (_, s) => ({
      position: s,
      isWarmup: s === 0,
      reps: 8 + s,
      weightKg: 50 + 10 * s,
      restSeconds: 90,
    })),
  })),
});

beforeAll(async () => {
  app = await createTestApp();
  alice = await signUp(app.server, { name: 'Alice', email: 'alice@test.local' });
  bob = await signUp(app.server, { name: 'Bob', email: 'bob@test.local' });
  const list = await trpcQuery<ExerciseEntry[]>(
    app.server,
    'exercises.list',
    undefined,
    alice.cookie,
  );
  exerciseIds = list.data.slice(0, 10).map((e) => e.id);
}, 120_000);

afterAll(async () => {
  await app?.stop();
});

describe('exercises library', () => {
  it('ships the full seeded index with embedded vocab', async () => {
    const res = await trpcQuery<ExerciseEntry[]>(
      app.server,
      'exercises.list',
      undefined,
      alice.cookie,
    );
    expect(res.data).toHaveLength(873);

    const curl = res.data.find((e) => e.slug === 'Alternate_Incline_Dumbbell_Curl')!;
    expect(curl.name).toBe('Alternate Incline Dumbbell Curl');
    expect(curl.equipment?.name).toBe('dumbbell');
    expect(curl.primaryMuscles).toEqual(['biceps']);
    expect(curl.secondaryMuscles).toEqual(['forearms']);
    expect(curl.thumbnail).toMatch(/^Alternate_Incline_Dumbbell_Curl\//);
  });

  it('returns detail lazily and NOT_FOUND for unknown ids', async () => {
    const detail = await trpcQuery<{ instructions: string[]; images: string[] }>(
      app.server,
      'exercises.byId',
      { id: exerciseIds[0] },
      alice.cookie,
    );
    expect(detail.data.instructions.length).toBeGreaterThan(0);
    expect(detail.data.images.length).toBeGreaterThan(0);

    const missing = await trpcQuery(
      app.server,
      'exercises.byId',
      { id: '00000000-0000-7000-8000-000000000000' },
      alice.cookie,
    );
    expect(missing.errorCode).toBe('NOT_FOUND');
  });

  it('exposes the filter vocab (12 equipments, 17 muscle groups)', async () => {
    const res = await trpcQuery<{ equipments: unknown[]; muscleGroups: unknown[] }>(
      app.server,
      'exercises.filters',
      undefined,
      alice.cookie,
    );
    expect(res.data.equipments).toHaveLength(12);
    expect(res.data.muscleGroups).toHaveLength(17);
  });
});

describe('profile + onboarding', () => {
  it('completes onboarding in one transaction and computes nothing from age', async () => {
    const res = await trpcMutation<{
      stats: { heightCm: number; gender: string; dateOfBirth: Date };
      settings: { defaultWorkoutVisibility: string };
      latestWeighIn: { weightKg: number };
    }>(
      app.server,
      'profile.completeOnboarding',
      {
        stats: { heightCm: 180, gender: 'male', dateOfBirth: new Date('1990-06-15T00:00:00Z') },
        settings: {
          unitPreference: 'metric',
          experienceLevel: 'intermediate',
          defaultWorkoutVisibility: 'friends',
        },
        weightKg: 82.3,
      },
      alice.cookie,
    );
    expect(res.status).toBe(200);
    expect(res.data.stats.dateOfBirth).toBeInstanceOf(Date);
    expect(res.data.stats.dateOfBirth.toISOString()).toBe('1990-06-15T00:00:00.000Z');
    expect(res.data.settings.defaultWorkoutVisibility).toBe('friends');
    expect(res.data.latestWeighIn.weightKg).toBe(82.3);
    expect(JSON.stringify(res.data)).not.toContain('"age"');
  });

  it('updates stats and settings partially', async () => {
    const stats = await trpcMutation<{ heightCm: number; gender: string }>(
      app.server,
      'profile.updateStats',
      { heightCm: 181 },
      alice.cookie,
    );
    expect(stats.data).toMatchObject({ heightCm: 181, gender: 'male' }); // gender untouched

    const settings = await trpcMutation<{ unitPreference: string; experienceLevel: string }>(
      app.server,
      'profile.updateSettings',
      { unitPreference: 'imperial' },
      alice.cookie,
    );
    expect(settings.data).toMatchObject({
      unitPreference: 'imperial',
      experienceLevel: 'intermediate',
    });
  });

  it('logs and deletes weigh-ins, guarding other users’ rows', async () => {
    const logged = await trpcMutation<{ id: string; weightKg: number }>(
      app.server,
      'profile.logWeight',
      { weightKg: 81.9, measuredAt: new Date('2026-07-01T08:00:00Z') },
      alice.cookie,
    );
    expect(logged.data.weightKg).toBe(81.9);

    const forbidden = await trpcMutation(
      app.server,
      'profile.deleteWeighIn',
      { id: logged.data.id },
      bob.cookie,
    );
    expect(forbidden.errorCode).toBe('FORBIDDEN');

    const deleted = await trpcMutation(
      app.server,
      'profile.deleteWeighIn',
      { id: logged.data.id },
      alice.cookie,
    );
    expect(deleted.status).toBe(200);

    const again = await trpcMutation(
      app.server,
      'profile.deleteWeighIn',
      { id: logged.data.id },
      alice.cookie,
    );
    expect(again.errorCode).toBe('NOT_FOUND');
  });
});

describe('workouts builder CRUD', () => {
  it('creates a whole document, defaulting visibility from user settings', async () => {
    const res = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Push Day'),
      alice.cookie,
    );
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      name: 'Push Day',
      status: 'planned',
      visibility: 'friends', // Alice's default_workout_visibility
      ownerId: alice.userId,
      exerciseCount: 2,
      setCount: 4,
    });
    expect(res.data.exercises.map((e) => e.position)).toEqual([0, 1]);
    expect(res.data.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1]);
    expect(res.data.exercises[0]!.exercise.name).toBeTruthy(); // embedded index entry
  });

  it('respects explicit visibility and validates input', async () => {
    const priv = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Secret Day', { visibility: 'private' }),
      alice.cookie,
    );
    expect(priv.data.visibility).toBe('private');

    const emptyName = await trpcMutation(
      app.server,
      'workouts.create',
      { ...workoutInput('ok'), name: '' },
      alice.cookie,
    );
    expect(emptyName.errorCode).toBe('BAD_REQUEST');

    const badExercise = await trpcMutation(
      app.server,
      'workouts.create',
      {
        name: 'Ghost',
        exercises: [
          {
            exerciseId: '00000000-0000-7000-8000-000000000000',
            position: 0,
            sets: [],
          },
        ],
      },
      alice.cookie,
    );
    expect(badExercise.errorCode).toBe('BAD_REQUEST');
  });

  it('replaces the document wholesale on update, owner-only', async () => {
    const created = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Editable'),
      alice.cookie,
    );

    const updated = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.update',
      {
        id: created.data.id,
        name: 'Edited',
        exercises: [
          {
            exerciseId: exerciseIds[2],
            position: 0,
            sets: [{ position: 0, isWarmup: false, reps: 5, weightKg: 100, restSeconds: 120 }],
          },
        ],
      },
      alice.cookie,
    );
    expect(updated.data).toMatchObject({ name: 'Edited', exerciseCount: 1, setCount: 1 });
    expect(updated.data.exercises[0]!.exercise.id).toBe(exerciseIds[2]);

    const notOwner = await trpcMutation(
      app.server,
      'workouts.update',
      { id: created.data.id, ...workoutInput('Hijack') },
      bob.cookie,
    );
    expect(notOwner.errorCode).toBe('FORBIDDEN');

    const missing = await trpcMutation(
      app.server,
      'workouts.update',
      { id: '00000000-0000-7000-8000-000000000000', ...workoutInput('Nope') },
      alice.cookie,
    );
    expect(missing.errorCode).toBe('NOT_FOUND');
  });

  it('paginates history by UUIDv7 cursor, newest first', async () => {
    for (const n of ['Page A', 'Page B', 'Page C']) {
      await trpcMutation(app.server, 'workouts.create', workoutInput(n), bob.cookie);
    }
    const page1 = await trpcQuery<{
      items: { name: string; id: string }[];
      nextCursor: string | null;
    }>(app.server, 'workouts.list', { limit: 2 }, bob.cookie);
    expect(page1.data.items.map((w) => w.name)).toEqual(['Page C', 'Page B']);
    expect(page1.data.nextCursor).toBeTruthy();

    const page2 = await trpcQuery<{ items: { name: string }[]; nextCursor: string | null }>(
      app.server,
      'workouts.list',
      { limit: 2, cursor: page1.data.nextCursor },
      bob.cookie,
    );
    expect(page2.data.items.map((w) => w.name)).toEqual(['Page A']);
    expect(page2.data.nextCursor).toBeNull();
  });

  it('deletes owner-only, any status', async () => {
    const created = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Doomed'),
      alice.cookie,
    );
    const forbidden = await trpcMutation(
      app.server,
      'workouts.delete',
      { id: created.data.id },
      bob.cookie,
    );
    expect(forbidden.errorCode).toBe('FORBIDDEN');

    await trpcMutation(app.server, 'workouts.delete', { id: created.data.id }, alice.cookie);
    const gone = await trpcQuery(
      app.server,
      'workouts.byId',
      { id: created.data.id },
      alice.cookie,
    );
    expect(gone.errorCode).toBe('NOT_FOUND');
  });
});

describe('logging state machine', () => {
  let doc: WorkoutDoc;

  beforeAll(async () => {
    const created = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Leg Day', { sets: 3 }),
      alice.cookie,
    );
    doc = created.data;
  });

  it('start: planned → in_progress (owner only)', async () => {
    const notOwner = await trpcMutation(
      app.server,
      'logging.start',
      { workoutId: doc.id },
      bob.cookie,
    );
    expect(notOwner.errorCode).toBe('FORBIDDEN');

    const started = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.start',
      { workoutId: doc.id },
      alice.cookie,
    );
    expect(started.data.status).toBe('in_progress');
    expect(started.data.startedAt).toBeInstanceOf(Date);

    const again = await trpcMutation(
      app.server,
      'logging.start',
      { workoutId: doc.id },
      alice.cookie,
    );
    expect(again.errorCode).toBe('BAD_REQUEST');
  });

  it('freezes the builder once in progress (workouts.update → BAD_REQUEST)', async () => {
    const res = await trpcMutation(
      app.server,
      'workouts.update',
      { id: doc.id, ...workoutInput('Restructure') },
      alice.cookie,
    );
    expect(res.errorCode).toBe('BAD_REQUEST');
  });

  it('completeSet applies inline overrides in one round trip', async () => {
    const setId = doc.exercises[0]!.sets[1]!.id;
    const res = await trpcMutation<SetOut>(
      app.server,
      'logging.completeSet',
      { setId, reps: 12, weightKg: 77.5 },
      alice.cookie,
    );
    expect(res.data.completedAt).toBeInstanceOf(Date);
    expect(res.data).toMatchObject({ reps: 12, weightKg: 77.5 });

    const undone = await trpcMutation<SetOut>(
      app.server,
      'logging.uncompleteSet',
      { setId },
      alice.cookie,
    );
    expect(undone.data.completedAt).toBeNull();
    expect(undone.data.reps).toBe(12); // overrides persist

    const redone = await trpcMutation<SetOut>(
      app.server,
      'logging.completeSet',
      { setId },
      alice.cookie,
    );
    expect(redone.data.completedAt).toBeInstanceOf(Date);
  });

  it('updateSet edits without completing, even on completed sets', async () => {
    const completedSetId = doc.exercises[0]!.sets[1]!.id;
    const res = await trpcMutation<SetOut>(
      app.server,
      'logging.updateSet',
      { setId: completedSetId, restSeconds: 150, isWarmup: false },
      alice.cookie,
    );
    expect(res.data.restSeconds).toBe(150);
    expect(res.data.completedAt).toBeInstanceOf(Date); // still completed
  });

  it('addSet appends with defaults copied from the last set', async () => {
    const we = doc.exercises[1]!;
    const lastSet = we.sets.at(-1)!;
    const res = await trpcMutation<SetOut>(
      app.server,
      'logging.addSet',
      { workoutExerciseId: we.id },
      alice.cookie,
    );
    expect(res.data.position).toBe(lastSet.position + 1);
    expect(res.data).toMatchObject({
      reps: lastSet.reps,
      weightKg: lastSet.weightKg,
      restSeconds: lastSet.restSeconds,
      isWarmup: false,
    });
  });

  it('finish: in_progress → completed; set mutations then become illegal', async () => {
    const finished = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.finish',
      { workoutId: doc.id },
      alice.cookie,
    );
    expect(finished.data.status).toBe('completed');
    expect(finished.data.endedAt).toBeInstanceOf(Date);

    const lateSet = await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: doc.exercises[0]!.sets[0]!.id },
      alice.cookie,
    );
    expect(lateSet.errorCode).toBe('BAD_REQUEST');

    const cancel = await trpcMutation(
      app.server,
      'logging.cancel',
      { workoutId: doc.id },
      alice.cookie,
    );
    expect(cancel.errorCode).toBe('BAD_REQUEST');

    const restart = await trpcMutation(
      app.server,
      'logging.start',
      { workoutId: doc.id },
      alice.cookie,
    );
    expect(restart.errorCode).toBe('BAD_REQUEST');
  });

  it('rejects set mutations on planned workouts (builder owns that state)', async () => {
    const planned = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Still Planned'),
      alice.cookie,
    );
    const res = await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: planned.data.exercises[0]!.sets[0]!.id },
      alice.cookie,
    );
    expect(res.errorCode).toBe('BAD_REQUEST');
  });

  it('cancel: in_progress → cancelled', async () => {
    const w = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Abandoned'),
      alice.cookie,
    );
    await trpcMutation(app.server, 'logging.start', { workoutId: w.data.id }, alice.cookie);
    const cancelled = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.cancel',
      { workoutId: w.data.id },
      alice.cookie,
    );
    expect(cancelled.data.status).toBe('cancelled');
    expect(cancelled.data.endedAt).toBeInstanceOf(Date);
  });
});

/** A workout of `ids` (2 plain sets each), already started. */
const startWorkout = async (name: string, ids: string[], superSetId?: string) => {
  const created = await trpcMutation<WorkoutDoc>(
    app.server,
    'workouts.create',
    {
      name,
      exercises: ids.map((exerciseId, i) => ({
        exerciseId,
        position: i,
        superSetId,
        sets: [0, 1].map((position) => ({
          position,
          isWarmup: false,
          reps: 8,
          weightKg: 40,
          restSeconds: 90,
        })),
      })),
    },
    alice.cookie,
  );
  await trpcMutation(app.server, 'logging.start', { workoutId: created.data.id }, alice.cookie);
  return created.data;
};

// Mid-workout structure edits (ADR-0004): the plan is editable while logging;
// a slot with logged work is dropped (kept for the record), never erased.
describe('mid-workout structure edits', () => {
  beforeAll(async () => {
    // Alice's last time doing exercise 0: 11 × 61 kg, then 9 × 71 kg
    const history = await startWorkout('History Day', [exerciseIds[0]!]);
    const [first, second] = history.exercises[0]!.sets;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: first!.id, reps: 11, weightKg: 61 },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: second!.id, reps: 9, weightKg: 71 },
      alice.cookie,
    );
    await trpcMutation(app.server, 'logging.finish', { workoutId: history.id }, alice.cookie);
  });

  it('addExercises appends at the end, prefilled from the last time you did it', async () => {
    const live = await startWorkout('Add Day', [exerciseIds[3]!]);
    const res = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.addExercises',
      { workoutId: live.id, exerciseIds: [exerciseIds[0]!, exerciseIds[2]!] },
      alice.cookie,
    );
    expect(res.data.exercises.map((e) => e.exercise.id)).toEqual([
      exerciseIds[3],
      exerciseIds[0],
      exerciseIds[2],
    ]);
    expect(res.data.exercises.map((e) => e.position)).toEqual([0, 1, 2]);

    const prefilled = res.data.exercises[1]!;
    expect(prefilled.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg }))).toEqual([
      { reps: 11, weightKg: 61 },
      { reps: 9, weightKg: 71 },
    ]);
    expect(prefilled.sets.every((s) => s.completedAt === null)).toBe(true);

    // Never performed → the builder's default block
    const fresh = res.data.exercises[2]!;
    expect(fresh.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg }))).toEqual([
      { reps: 8, weightKg: 0 },
      { reps: 8, weightKg: 0 },
      { reps: 8, weightKg: 0 },
    ]);
  });

  it('addExercises: owner-only, in-progress-only, known exercises, no duplicates', async () => {
    const live = await startWorkout('Guarded', [exerciseIds[3]!]);

    const notOwner = await trpcMutation(
      app.server,
      'logging.addExercises',
      { workoutId: live.id, exerciseIds: [exerciseIds[0]!] },
      bob.cookie,
    );
    expect(notOwner.errorCode).toBe('FORBIDDEN');

    const unknown = await trpcMutation(
      app.server,
      'logging.addExercises',
      { workoutId: live.id, exerciseIds: ['0195c2f0-0000-7000-8000-000000000000'] },
      alice.cookie,
    );
    expect(unknown.errorCode).toBe('BAD_REQUEST');

    // Already in the live plan → skipped, not duplicated
    const dupe = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.addExercises',
      { workoutId: live.id, exerciseIds: [exerciseIds[3]!, exerciseIds[2]!] },
      alice.cookie,
    );
    expect(dupe.data.exercises.map((e) => e.exercise.id)).toEqual([exerciseIds[3], exerciseIds[2]]);

    const planned = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Not Started'),
      alice.cookie,
    );
    const tooEarly = await trpcMutation(
      app.server,
      'logging.addExercises',
      { workoutId: planned.data.id, exerciseIds: [exerciseIds[2]!] },
      alice.cookie,
    );
    expect(tooEarly.errorCode).toBe('BAD_REQUEST');
  });

  it('removeExercise: erases an untouched slot, drops one with logged work', async () => {
    const live = await startWorkout('Remove Day', [exerciseIds[0]!, exerciseIds[1]!]);
    const [worked, untouched] = live.exercises;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: worked!.sets[0]!.id },
      alice.cookie,
    );

    const afterDrop = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: worked!.id },
      alice.cookie,
    );
    const dropped = afterDrop.data.exercises.find((e) => e.id === worked!.id);
    expect(dropped?.droppedAt).toBeInstanceOf(Date);
    // the completed set survives; the untouched one goes with the plan
    expect(dropped?.sets.map((s) => s.id)).toEqual([worked!.sets[0]!.id]);
    expect(dropped?.sets[0]!.completedAt).toBeInstanceOf(Date);

    const afterErase = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: untouched!.id },
      alice.cookie,
    );
    expect(afterErase.data.exercises.map((e) => e.id)).toEqual([worked!.id]);
  });

  it('replaceExercise swaps in place, inheriting position and superset', async () => {
    const groupId = '0195c2f0-1111-7000-8000-000000000000';
    const live = await startWorkout('Swap Day', [exerciseIds[4]!, exerciseIds[5]!], groupId);
    const target = live.exercises[0]!;

    const res = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.replaceExercise',
      { workoutExerciseId: target.id, exerciseId: exerciseIds[0]! },
      alice.cookie,
    );
    expect(res.data.exercises.map((e) => e.exercise.id)).toEqual([exerciseIds[0], exerciseIds[5]]);
    const swappedIn = res.data.exercises[0]!;
    expect(swappedIn.id).not.toBe(target.id); // untouched slot is erased, not reused
    expect(swappedIn.position).toBe(0);
    expect(swappedIn.superSetId).toBe(groupId);
    // fresh sets come from history, never from the exercise being replaced
    expect(swappedIn.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg }))).toEqual([
      { reps: 11, weightKg: 61 },
      { reps: 9, weightKg: 71 },
    ]);
  });

  it('replaceExercise keeps logged work on the record, ordered before its replacement', async () => {
    const live = await startWorkout('Swap After Work', [exerciseIds[4]!, exerciseIds[5]!]);
    const target = live.exercises[0]!;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: target.sets[0]!.id, reps: 5, weightKg: 100 },
      alice.cookie,
    );

    const res = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.replaceExercise',
      { workoutExerciseId: target.id, exerciseId: exerciseIds[2]! },
      alice.cookie,
    );
    expect(res.data.exercises.map((e) => e.exercise.id)).toEqual([
      exerciseIds[4], // dropped, kept for the record
      exerciseIds[2], // its replacement, same position
      exerciseIds[5],
    ]);
    const [droppedSlot, replacement] = res.data.exercises;
    expect(droppedSlot!.droppedAt).toBeInstanceOf(Date);
    expect(droppedSlot!.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg }))).toEqual([
      { reps: 5, weightKg: 100 },
    ]);
    expect(replacement!.droppedAt).toBeNull();
  });

  it('drops a superset member out of its group, so it never brackets with its replacement', async () => {
    const groupId = '0195c2f0-2222-7000-8000-000000000000';
    const live = await startWorkout('Grouped Swap', [exerciseIds[4]!, exerciseIds[5]!], groupId);
    const target = live.exercises[0]!;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: target.sets[0]!.id },
      alice.cookie,
    );

    const res = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.replaceExercise',
      { workoutExerciseId: target.id, exerciseId: exerciseIds[2]! },
      alice.cookie,
    );
    const [dropped, replacement] = res.data.exercises;
    expect(dropped!.droppedAt).toBeInstanceOf(Date);
    expect(dropped!.superSetId).toBeNull(); // grouping is a plan concept
    expect(replacement!.superSetId).toBe(groupId);
  });

  it('clones the plan as performed — a dropped slot is not copied forward', async () => {
    const live = await startWorkout('Cloneable', [exerciseIds[8]!, exerciseIds[9]!]);
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: live.exercises[0]!.sets[0]!.id },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: live.exercises[0]!.id },
      alice.cookie,
    );
    await trpcMutation(app.server, 'logging.finish', { workoutId: live.id }, alice.cookie);

    const cloned = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.clone',
      { source: { workoutId: live.id } },
      alice.cookie,
    );
    expect(cloned.data.exercises.map((e) => e.exercise.id)).toEqual([exerciseIds[9]]);
    expect(cloned.data.exercises[0]!.position).toBe(0);
  });

  it('still counts a dropped slot toward volume once the workout is completed', async () => {
    const before = await trpcQuery<{ totalVolumeKg: number }>(
      app.server,
      'stats.summary',
      {},
      alice.cookie,
    );

    const live = await startWorkout('Dropped Volume', [exerciseIds[6]!, exerciseIds[7]!]);
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: live.exercises[0]!.sets[0]!.id, reps: 10, weightKg: 30 },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: live.exercises[0]!.id },
      alice.cookie,
    );
    await trpcMutation(app.server, 'logging.finish', { workoutId: live.id }, alice.cookie);

    const after = await trpcQuery<{ totalVolumeKg: number }>(
      app.server,
      'stats.summary',
      {},
      alice.cookie,
    );
    expect(after.data.totalVolumeKg - before.data.totalVolumeKg).toBe(300);
  });
});

// Deleting sets mid-workout (BUD-8). A hard delete is safe because it is only
// reachable while `in_progress` — no completed workout is ever rewritten.
describe('deleting sets mid-workout', () => {
  it('removeSet takes an uncompleted set off the workout', async () => {
    const live = await startWorkout('Delete Day', [exerciseIds[0]!]);
    const [first, second] = live.exercises[0]!.sets;

    const res = await trpcMutation<SetOut>(
      app.server,
      'logging.removeSet',
      { setId: second!.id },
      alice.cookie,
    );
    expect(res.data.id).toBe(second!.id);

    const after = await trpcQuery<WorkoutDoc>(
      app.server,
      'workouts.byId',
      { id: live.id },
      alice.cookie,
    );
    expect(after.data.exercises[0]!.sets.map((s) => s.id)).toEqual([first!.id]);
  });

  // The load-bearing case: deleting logged work is legal, and safe, because it
  // can only happen before the workout is finished.
  it('a deleted completed set never reaches the finished volume', async () => {
    const before = await trpcQuery<{ totalVolumeKg: number }>(
      app.server,
      'stats.summary',
      {},
      alice.cookie,
    );

    const live = await startWorkout('Mistap Day', [exerciseIds[1]!]);
    const [kept, mistap] = live.exercises[0]!.sets;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: kept!.id, reps: 10, weightKg: 20 },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: mistap!.id, reps: 10, weightKg: 50 },
      alice.cookie,
    );

    const removed = await trpcMutation<SetOut>(
      app.server,
      'logging.removeSet',
      { setId: mistap!.id },
      alice.cookie,
    );
    expect(removed.data.completedAt).toBeInstanceOf(Date);

    await trpcMutation(app.server, 'logging.finish', { workoutId: live.id }, alice.cookie);

    const after = await trpcQuery<{ totalVolumeKg: number }>(
      app.server,
      'stats.summary',
      {},
      alice.cookie,
    );
    expect(after.data.totalVolumeKg - before.data.totalVolumeKg).toBe(200); // not 700
  });

  it('removeSet: unknown, someone else’s, planned, finished, and dropped are all refused', async () => {
    const live = await startWorkout('Guarded Delete', [exerciseIds[2]!, exerciseIds[3]!]);

    const unknown = await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: '0195c2f0-3333-7000-8000-000000000000' },
      alice.cookie,
    );
    expect(unknown.errorCode).toBe('NOT_FOUND');

    const notOwner = await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: live.exercises[0]!.sets[0]!.id },
      bob.cookie,
    );
    expect(notOwner.errorCode).toBe('FORBIDDEN');

    const planned = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      workoutInput('Never Started'),
      alice.cookie,
    );
    const tooEarly = await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: planned.data.exercises[0]!.sets[0]!.id },
      alice.cookie,
    );
    expect(tooEarly.errorCode).toBe('BAD_REQUEST');

    // A dropped slot is a frozen record (ADR-0004) — its sets stay put
    const doomed = live.exercises[1]!;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: doomed.sets[0]!.id },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: doomed.id },
      alice.cookie,
    );
    const onDropped = await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: doomed.sets[0]!.id },
      alice.cookie,
    );
    expect(onDropped.errorCode).toBe('BAD_REQUEST');

    await trpcMutation(app.server, 'logging.finish', { workoutId: live.id }, alice.cookie);
    const tooLate = await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: live.exercises[0]!.sets[0]!.id },
      alice.cookie,
    );
    expect(tooLate.errorCode).toBe('BAD_REQUEST');
  });

  it('an emptied slot stays addressable — the next addSet restarts at position 0', async () => {
    const live = await startWorkout('Emptied', [exerciseIds[4]!]);
    const slot = live.exercises[0]!;
    for (const set of slot.sets) {
      await trpcMutation(app.server, 'logging.removeSet', { setId: set.id }, alice.cookie);
    }

    const readded = await trpcMutation<SetOut>(
      app.server,
      'logging.addSet',
      { workoutExerciseId: slot.id },
      alice.cookie,
    );
    expect(readded.data.position).toBe(0);
  });

  it('finish clears slots with no sets — however they got that way', async () => {
    // One emptied by removeSet, one the builder never gave a set to
    const created = await trpcMutation<WorkoutDoc>(
      app.server,
      'workouts.create',
      {
        name: 'Emptied At Finish',
        exercises: [exerciseIds[5]!, exerciseIds[6]!, exerciseIds[7]!].map((exerciseId, i) => ({
          exerciseId,
          position: i,
          sets:
            i === 2
              ? []
              : [{ position: 0, isWarmup: false, reps: 8, weightKg: 40, restSeconds: 90 }],
        })),
      },
      alice.cookie,
    );
    const live = created.data;
    await trpcMutation(app.server, 'logging.start', { workoutId: live.id }, alice.cookie);

    const [emptied, kept] = live.exercises;
    await trpcMutation(
      app.server,
      'logging.removeSet',
      { setId: emptied!.sets[0]!.id },
      alice.cookie,
    );

    const finished = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.finish',
      { workoutId: live.id },
      alice.cookie,
    );
    expect(finished.data.exercises.map((e) => e.id)).toEqual([kept!.id]);
    expect(finished.data.exerciseCount).toBe(1);
  });

  it('finish keeps a dropped slot even though the tidy-up runs', async () => {
    const live = await startWorkout('Dropped Survives Finish', [exerciseIds[8]!, exerciseIds[9]!]);
    const [dropped, kept] = live.exercises;
    await trpcMutation(
      app.server,
      'logging.completeSet',
      { setId: dropped!.sets[0]!.id },
      alice.cookie,
    );
    await trpcMutation(
      app.server,
      'logging.removeExercise',
      { workoutExerciseId: dropped!.id },
      alice.cookie,
    );

    const finished = await trpcMutation<WorkoutDoc>(
      app.server,
      'logging.finish',
      { workoutId: live.id },
      alice.cookie,
    );
    expect(finished.data.exercises.map((e) => e.id)).toEqual([dropped!.id, kept!.id]);
  });
});
