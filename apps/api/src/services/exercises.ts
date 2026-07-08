import { asc, eq, schema, type Database } from '@buddy-pass/db';

const { exercises } = schema;

type Exercise = typeof schema.exercises.$inferSelect;
type Equipment = typeof schema.equipments.$inferSelect;
type ExerciseMuscle = typeof schema.exerciseMuscles.$inferSelect;
type MuscleGroup = typeof schema.muscleGroups.$inferSelect;

export type ExerciseWithRelations = Exercise & {
  equipment: Equipment | null;
  muscles: (ExerciseMuscle & { muscleGroup: MuscleGroup })[];
};

/** Relational `with` clause that loads everything an index entry needs. */
export const exerciseRelationsWith = {
  equipment: true,
  muscles: { with: { muscleGroup: true } },
} as const;

/** Lightweight library row (plans/API.md §2.1) — muscles as names for filter chips. */
export function toExerciseIndexEntry(row: ExerciseWithRelations) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    level: row.level,
    force: row.force,
    mechanic: row.mechanic,
    category: row.category,
    equipment: row.equipment ? { id: row.equipment.id, name: row.equipment.name } : null,
    primaryMuscles: row.muscles.filter((m) => m.role === 'primary').map((m) => m.muscleGroup.name),
    secondaryMuscles: row.muscles
      .filter((m) => m.role === 'secondary')
      .map((m) => m.muscleGroup.name),
    /** Relative path; client prepends IMAGE_BASE_URL. `.at()` keeps the inferred wire type honestly nullable (API.md §2.1). */
    thumbnail: row.images.at(0) ?? null,
  };
}
export type ExerciseIndexEntry = ReturnType<typeof toExerciseIndexEntry>;

/** The full library (~873 rows) — small enough to ship whole; client filters locally. */
export async function listExerciseIndex(db: Database) {
  const rows = await db.query.exercises.findMany({
    with: exerciseRelationsWith,
    orderBy: [asc(exercises.name)],
  });
  return rows.map(toExerciseIndexEntry);
}

export async function getExerciseDetail(db: Database, id: string) {
  const row = await db.query.exercises.findFirst({
    where: eq(exercises.id, id),
    with: exerciseRelationsWith,
  });
  if (!row) return null;
  return {
    ...toExerciseIndexEntry(row),
    description: row.description,
    instructions: row.instructions,
    images: row.images,
  };
}

/** Vocab for filter chips — fixed lists, not paginated. */
export async function listExerciseFilters(db: Database) {
  const [equipments, muscleGroups] = await Promise.all([
    db.query.equipments.findMany({ orderBy: [asc(schema.equipments.name)] }),
    db.query.muscleGroups.findMany({ orderBy: [asc(schema.muscleGroups.name)] }),
  ]);
  return {
    equipments: equipments.map((e) => ({ id: e.id, name: e.name, type: e.type })),
    muscleGroups: muscleGroups.map((m) => ({ id: m.id, name: m.name })),
  };
}
