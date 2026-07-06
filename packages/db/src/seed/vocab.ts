// Fixed vocabularies from free-exercise-db schema.json (commit-pinned in data/).

/** Equipment name → coarse type for filtering ("Your Gym", generation). */
export const EQUIPMENT_TYPES = {
  barbell: 'free_weight',
  dumbbell: 'free_weight',
  kettlebells: 'free_weight',
  'e-z curl bar': 'free_weight',
  'medicine ball': 'free_weight',
  machine: 'machine',
  cable: 'machine',
  bands: 'accessory',
  'exercise ball': 'accessory',
  'foam roll': 'accessory',
  'body only': 'bodyweight',
  other: 'other',
} as const;

export const EQUIPMENT_NAMES = Object.keys(EQUIPMENT_TYPES) as (keyof typeof EQUIPMENT_TYPES)[];

export const MUSCLE_GROUP_NAMES = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
] as const;

export const EXERCISE_CATEGORIES = [
  'strength',
  'stretching',
  'cardio',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
  'plyometrics',
] as const;
