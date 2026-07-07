import type { StatsBucket } from '@buddy-pass/shared';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNotNull,
  lte,
  schema,
  sql,
  type Database,
  type SQL,
} from '@buddy-pass/db';

const {
  workouts,
  workoutExercises,
  workoutSets,
  exerciseMuscles,
  muscleGroups,
  bodyMeasurements,
  user,
} = schema;

// Volume = Σ (reps × weight_kg) over completed sets of completed workouts,
// warm-ups excluded (plans/API.md §2.7). Friend views only ever aggregate
// friends-visible workouts so derived numbers never leak private ones.

const volumeExpr =
  sql<number>`coalesce(sum(${workoutSets.reps} * coalesce(${workoutSets.weightKg}, 0)), 0)`.mapWith(
    Number,
  );

function completedSetConds(opts: {
  ownerId: string;
  visibleOnly: boolean;
  from?: Date;
  to?: Date;
}) {
  const conds: SQL[] = [
    eq(workouts.ownerId, opts.ownerId),
    eq(workouts.status, 'completed'),
    isNotNull(workoutSets.completedAt),
    eq(workoutSets.isWarmup, false),
  ];
  if (opts.visibleOnly) conds.push(eq(workouts.visibility, 'friends'));
  if (opts.from) conds.push(gte(workouts.endedAt, opts.from));
  if (opts.to) conds.push(lte(workouts.endedAt, opts.to));
  return conds;
}

export async function volumeOverTime(
  db: Database,
  opts: { ownerId: string; visibleOnly: boolean; bucket: StatsBucket; from?: Date; to?: Date },
) {
  // bucket is zod-validated ('day'|'week'|'month') — safe to inline
  const bucketExpr = sql`date_trunc(${sql.raw(`'${opts.bucket}'`)}, ${workouts.endedAt})`;
  // raw fragments bypass drizzle's column decoders — pg hands back a string
  const bucketStart = bucketExpr.mapWith((v: string | Date) =>
    v instanceof Date ? v : new Date(v),
  );
  return db
    .select({ bucketStart, totalVolumeKg: volumeExpr, workoutCount: countDistinct(workouts.id) })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(...completedSetConds(opts)))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);
}

export async function statsSummary(db: Database, opts: { ownerId: string; visibleOnly: boolean }) {
  const workoutConds: SQL[] = [
    eq(workouts.ownerId, opts.ownerId),
    eq(workouts.status, 'completed'),
  ];
  if (opts.visibleOnly) workoutConds.push(eq(workouts.visibility, 'friends'));

  const [workoutAgg] = await db
    .select({
      workoutsCompleted: count(),
      currentWeekCount:
        sql<number>`count(*) filter (where ${workouts.endedAt} >= date_trunc('week', now()))`.mapWith(
          Number,
        ),
    })
    .from(workouts)
    .where(and(...workoutConds));

  const [volumeAgg] = await db
    .select({ totalVolumeKg: volumeExpr })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(...completedSetConds(opts)));

  const setCountExpr = count();
  const topMuscleGroups = await db
    .select({ name: muscleGroups.name, setCount: setCountExpr })
    .from(workoutSets)
    .innerJoin(workoutExercises, eq(workoutSets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(
      exerciseMuscles,
      and(
        eq(exerciseMuscles.exerciseId, workoutExercises.exerciseId),
        eq(exerciseMuscles.role, 'primary'),
      ),
    )
    .innerJoin(muscleGroups, eq(exerciseMuscles.muscleGroupId, muscleGroups.id))
    .where(and(...completedSetConds(opts)))
    .groupBy(muscleGroups.name)
    .orderBy(desc(setCountExpr), asc(muscleGroups.name))
    .limit(3);

  const [owner] = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, opts.ownerId));

  return {
    workoutsCompleted: workoutAgg?.workoutsCompleted ?? 0,
    totalVolumeKg: volumeAgg?.totalVolumeKg ?? 0,
    currentWeekCount: workoutAgg?.currentWeekCount ?? 0,
    topMuscleGroups,
    memberSince: owner?.createdAt ?? null,
  };
}

/** Self only — body weight is not workout-derived and is never shared in MVP. */
export async function bodyWeightSeries(
  db: Database,
  opts: { userId: string; from?: Date; to?: Date },
) {
  const conds: SQL[] = [eq(bodyMeasurements.userId, opts.userId)];
  if (opts.from) conds.push(gte(bodyMeasurements.measuredAt, opts.from));
  if (opts.to) conds.push(lte(bodyMeasurements.measuredAt, opts.to));
  return db
    .select({ measuredAt: bodyMeasurements.measuredAt, weightKg: bodyMeasurements.weightKg })
    .from(bodyMeasurements)
    .where(and(...conds))
    .orderBy(asc(bodyMeasurements.measuredAt));
}
