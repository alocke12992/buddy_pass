import { describe, expect, it } from 'vitest';
import { toExerciseIndexEntry, type ExerciseWithRelations } from './exercises';

const muscle = (name: string, role: 'primary' | 'secondary') => ({
  exerciseId: 'ex1',
  muscleGroupId: `mg-${name}`,
  role,
  muscleGroup: { id: `mg-${name}`, name, slug: name.toLowerCase() },
});

const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'ex1',
    slug: 'barbell-squat',
    name: 'Barbell Squat',
    level: 'intermediate',
    force: 'push',
    mechanic: 'compound',
    category: 'strength',
    images: ['Barbell_Squat/0.jpg', 'Barbell_Squat/1.jpg'],
    equipment: { id: 'eq1', name: 'Barbell', slug: 'barbell' },
    muscles: [
      muscle('Quadriceps', 'primary'),
      muscle('Glutes', 'secondary'),
      muscle('Hamstrings', 'primary'),
    ],
    ...overrides,
  }) as unknown as ExerciseWithRelations;

describe('toExerciseIndexEntry', () => {
  it('splits muscles by role, keeping load order', () => {
    const entry = toExerciseIndexEntry(row());
    expect(entry.primaryMuscles).toEqual(['Quadriceps', 'Hamstrings']);
    expect(entry.secondaryMuscles).toEqual(['Glutes']);
  });

  it('flattens equipment to id and name for the filter chips', () => {
    expect(toExerciseIndexEntry(row()).equipment).toEqual({ id: 'eq1', name: 'Barbell' });
    expect(toExerciseIndexEntry(row({ equipment: null })).equipment).toBeNull();
  });

  it('takes the first image as a relative thumbnail path', () => {
    expect(toExerciseIndexEntry(row()).thumbnail).toBe('Barbell_Squat/0.jpg');
  });

  it('reports no thumbnail rather than undefined when the library has no images', () => {
    expect(toExerciseIndexEntry(row({ images: [] })).thumbnail).toBeNull();
  });
});
