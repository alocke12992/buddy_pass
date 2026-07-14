import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Database } from '../client';
import { equipments, exerciseMuscles, exercises, muscleGroups } from '../schema/index';
import { sourceFileSchema } from './source-schema';
import { EQUIPMENT_TYPES, MUSCLE_GROUP_NAMES } from './vocab';

// Vendored from yuhonas/free-exercise-db dist/exercises.json
// pinned at commit 5197c055b356498944328bd00178b64a5e9f422c (schema: schema.json there);
// sha256 d68a817484964095e6af0be2cdcbcc2c2504168d1d190c7d5c725ce52f3ae1f4 — keep byte-identical
// (packages/db/data is prettier-ignored for this reason).
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/exercises.json');

const CHUNK = 200;

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Idempotent library seed: upserts equipments + muscle_groups + exercises,
 * rebuilds the exercise_muscles join (library-owned, no user data references it).
 */
export async function seedLibrary(db: Database, dataFile = DATA_FILE) {
  const raw = JSON.parse(await readFile(dataFile, 'utf8'));
  const source = sourceFileSchema.parse(raw);

  await db
    .insert(equipments)
    .values(Object.entries(EQUIPMENT_TYPES).map(([name, type]) => ({ name, type })))
    .onConflictDoUpdate({
      target: equipments.name,
      set: { type: sql`excluded.type`, updatedAt: new Date() },
    });

  await db
    .insert(muscleGroups)
    .values(MUSCLE_GROUP_NAMES.map((name) => ({ name })))
    .onConflictDoNothing({ target: muscleGroups.name });

  const equipmentIdByName = new Map(
    (await db.select({ id: equipments.id, name: equipments.name }).from(equipments)).map((r) => [
      r.name,
      r.id,
    ]),
  );
  const muscleIdByName = new Map(
    (await db.select({ id: muscleGroups.id, name: muscleGroups.name }).from(muscleGroups)).map(
      (r) => [r.name, r.id],
    ),
  );

  for (const batch of chunks(source, CHUNK)) {
    await db
      .insert(exercises)
      .values(
        batch.map((e) => ({
          slug: e.id,
          name: e.name,
          category: e.category,
          force: e.force,
          mechanic: e.mechanic,
          level: e.level,
          instructions: e.instructions,
          images: e.images,
          equipmentId: e.equipment ? (equipmentIdByName.get(e.equipment) ?? null) : null,
        })),
      )
      .onConflictDoUpdate({
        target: exercises.slug,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          force: sql`excluded.force`,
          mechanic: sql`excluded.mechanic`,
          level: sql`excluded.level`,
          instructions: sql`excluded.instructions`,
          images: sql`excluded.images`,
          equipmentId: sql`excluded.equipment_id`,
          updatedAt: new Date(),
        },
      });
  }

  const exerciseIdBySlug = new Map(
    (await db.select({ id: exercises.id, slug: exercises.slug }).from(exercises)).map((r) => [
      r.slug,
      r.id,
    ]),
  );

  // Rebuild the join table wholesale so removals in the source propagate.
  const muscleRows = source.flatMap((e) => {
    const exerciseId = exerciseIdBySlug.get(e.id);
    if (!exerciseId) return [];
    const roles = [
      ...[...new Set(e.primaryMuscles)].map((m) => ({ muscle: m, role: 'primary' as const })),
      ...[...new Set(e.secondaryMuscles)].map((m) => ({ muscle: m, role: 'secondary' as const })),
    ];
    return roles.map(({ muscle, role }) => ({
      exerciseId,
      muscleGroupId: muscleIdByName.get(muscle)!,
      role,
    }));
  });

  await db.delete(exerciseMuscles);
  for (const batch of chunks(muscleRows, CHUNK * 2)) {
    await db.insert(exerciseMuscles).values(batch);
  }

  return {
    equipments: equipmentIdByName.size,
    muscleGroups: muscleIdByName.size,
    exercises: exerciseIdBySlug.size,
    exerciseMuscles: muscleRows.length,
  };
}
