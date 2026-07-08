import type { WorkoutInput, WorkoutVisibility } from '@buddy-pass/shared';
import type { ExerciseIndexEntry, WorkoutDoc } from '@/lib/api-types';

/**
 * Builder editing model: plain immutable state, kg canonical (display
 * conversion happens in the inputs). Keys are client-only identities for
 * React/dnd — positions are derived from array order at save time.
 */
export interface BuilderSet {
  key: string;
  isWarmup: boolean;
  reps: number;
  weightKg: number;
  restSeconds: number;
}

export interface BuilderExercise {
  key: string;
  exercise: ExerciseIndexEntry;
  superSetId: string | null;
  sets: BuilderSet[];
}

export interface BuilderState {
  name: string;
  notes: string;
  scheduledFor: Date | null;
  visibility: WorkoutVisibility | null;
  exercises: BuilderExercise[];
}

const newKey = () => crypto.randomUUID();

export function emptyBuilder(): BuilderState {
  return { name: '', notes: '', scheduledFor: null, visibility: null, exercises: [] };
}

export function builderFromDoc(doc: WorkoutDoc): BuilderState {
  return {
    name: doc.name,
    notes: doc.notes ?? '',
    scheduledFor: doc.scheduledFor,
    visibility: doc.visibility,
    exercises: doc.exercises.map((we) => ({
      key: newKey(),
      exercise: we.exercise,
      superSetId: we.superSetId,
      sets: we.sets.map((s) => ({
        key: newKey(),
        isWarmup: s.isWarmup,
        reps: s.reps,
        weightKg: s.weightKg ?? 0, // db column is nullable; 0 = bodyweight
        restSeconds: s.restSeconds,
      })),
    })),
  };
}

export function builderToInput(state: BuilderState): WorkoutInput {
  return {
    name: state.name.trim(),
    notes: state.notes.trim() === '' ? undefined : state.notes.trim(),
    scheduledFor: state.scheduledFor ?? undefined,
    visibility: state.visibility ?? undefined,
    exercises: state.exercises.map((ex, i) => ({
      exerciseId: ex.exercise.id,
      position: i,
      superSetId: ex.superSetId ?? undefined,
      sets: ex.sets.map((s, j) => ({
        position: j,
        isWarmup: s.isWarmup,
        reps: s.reps,
        weightKg: s.weightKg,
        restSeconds: s.restSeconds,
      })),
    })),
  };
}

function defaultSets(): BuilderSet[] {
  // 3 × 8 @ bodyweight (0 kg) with the schema's default rest — user fills weights
  return Array.from({ length: 3 }, () => ({
    key: newKey(),
    isWarmup: false,
    reps: 8,
    weightKg: 0,
    restSeconds: 90,
  }));
}

export function addExercise(state: BuilderState, entry: ExerciseIndexEntry): BuilderState {
  const exercise: BuilderExercise = {
    key: newKey(),
    exercise: entry,
    superSetId: null,
    sets: defaultSets(),
  };
  return { ...state, exercises: [...state.exercises, exercise] };
}

export function removeExercise(state: BuilderState, key: string): BuilderState {
  return normalizeSupersets({
    ...state,
    exercises: state.exercises.filter((e) => e.key !== key),
  });
}

/**
 * Picker taps toggle membership: tapping an already-added exercise removes it
 * (set config included) — the picker never creates duplicates.
 */
export function toggleExercise(state: BuilderState, entry: ExerciseIndexEntry): BuilderState {
  const exists = state.exercises.some((e) => e.exercise.id === entry.id);
  if (!exists) return addExercise(state, entry);
  return normalizeSupersets({
    ...state,
    exercises: state.exercises.filter((e) => e.exercise.id !== entry.id),
  });
}

export function moveExercise(state: BuilderState, from: number, to: number): BuilderState {
  if (from === to || from < 0 || to < 0) return state;
  const exercises = [...state.exercises];
  const [moved] = exercises.splice(from, 1);
  exercises.splice(to, 0, moved!);
  return normalizeSupersets({ ...state, exercises });
}

/** "Link with previous" (FRONTEND.md §3.2): joins the previous exercise's group, minting one if needed. */
export function linkWithPrevious(state: BuilderState, key: string): BuilderState {
  const index = state.exercises.findIndex((e) => e.key === key);
  if (index <= 0) return state;
  const previous = state.exercises[index - 1]!;
  const groupId = previous.superSetId ?? newKey();
  const exercises = state.exercises.map((e, i) =>
    i === index || i === index - 1 ? { ...e, superSetId: e.superSetId ?? groupId } : e,
  );
  // The linked exercise always adopts the previous group id
  exercises[index] = { ...exercises[index]!, superSetId: groupId };
  return normalizeSupersets({ ...state, exercises });
}

export function unlinkFromSuperset(state: BuilderState, key: string): BuilderState {
  const exercises = state.exercises.map((e) => (e.key === key ? { ...e, superSetId: null } : e));
  return normalizeSupersets({ ...state, exercises });
}

/**
 * Supersets are contiguous runs sharing a group id. After any structural
 * change: singleton "groups" dissolve, and a group split by a drag becomes
 * two independent groups (later runs get fresh ids).
 */
export function normalizeSupersets(state: BuilderState): BuilderState {
  const seen = new Set<string>();
  const exercises: BuilderExercise[] = [];
  let i = 0;
  while (i < state.exercises.length) {
    const current = state.exercises[i]!;
    if (current.superSetId === null) {
      exercises.push(current);
      i++;
      continue;
    }
    let runEnd = i + 1;
    while (
      runEnd < state.exercises.length &&
      state.exercises[runEnd]!.superSetId === current.superSetId
    ) {
      runEnd++;
    }
    const runLength = runEnd - i;
    if (runLength === 1) {
      exercises.push({ ...current, superSetId: null });
    } else {
      const groupId = seen.has(current.superSetId) ? newKey() : current.superSetId;
      seen.add(current.superSetId);
      for (let j = i; j < runEnd; j++) {
        exercises.push({ ...state.exercises[j]!, superSetId: groupId });
      }
    }
    i = runEnd;
  }
  return { ...state, exercises };
}

export function updateSet(
  state: BuilderState,
  exerciseKey: string,
  setKey: string,
  patch: Partial<Omit<BuilderSet, 'key'>>,
): BuilderState {
  return {
    ...state,
    exercises: state.exercises.map((e) =>
      e.key === exerciseKey
        ? { ...e, sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)) }
        : e,
    ),
  };
}

/** Appends a set copying the last one's numbers — the "one more set" gesture. */
export function addSet(state: BuilderState, exerciseKey: string): BuilderState {
  return {
    ...state,
    exercises: state.exercises.map((e) => {
      if (e.key !== exerciseKey) return e;
      const last = e.sets.at(-1);
      const set: BuilderSet = last
        ? { ...last, key: newKey(), isWarmup: false }
        : defaultSets()[0]!;
      return { ...e, sets: [...e.sets, set] };
    }),
  };
}

export function duplicateSet(
  state: BuilderState,
  exerciseKey: string,
  setKey: string,
): BuilderState {
  return {
    ...state,
    exercises: state.exercises.map((e) => {
      if (e.key !== exerciseKey) return e;
      const index = e.sets.findIndex((s) => s.key === setKey);
      if (index < 0) return e;
      const sets = [...e.sets];
      sets.splice(index + 1, 0, { ...e.sets[index]!, key: newKey() });
      return { ...e, sets };
    }),
  };
}

export function removeSet(state: BuilderState, exerciseKey: string, setKey: string): BuilderState {
  return {
    ...state,
    exercises: state.exercises.map((e) =>
      e.key === exerciseKey ? { ...e, sets: e.sets.filter((s) => s.key !== setKey) } : e,
    ),
  };
}
