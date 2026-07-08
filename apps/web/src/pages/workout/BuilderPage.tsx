import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { UnitPreference } from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dumbbell, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Navigate, useBlocker, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/EmptyState';
import { ErrorCard } from '@/components/app/ErrorCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExerciseIndexEntry, WorkoutDoc } from '@/lib/api-types';
import { useTRPC } from '@/lib/trpc';
import { ExerciseCard } from './builder/ExerciseCard';
import { ExerciseMenuSheet } from './builder/ExerciseMenuSheet';
import { PickerSheet } from './builder/PickerSheet';
import { ReplaceSheet } from './builder/ReplaceSheet';
import { SaveSheet } from './builder/SaveSheet';
import { SupersetSheet } from './builder/SupersetSheet';
import {
  addSet,
  builderFromDoc,
  builderToInput,
  buildSuperset,
  duplicateSet,
  emptyBuilder,
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  toggleExercise,
  updateSet,
  type BuilderState,
} from './builder/state';

function groupedPosition(state: BuilderState, index: number): 'none' | 'first' | 'middle' | 'last' {
  const current = state.exercises[index]!;
  if (current.superSetId === null) return 'none';
  const prev = state.exercises[index - 1]?.superSetId === current.superSetId;
  const next = state.exercises[index + 1]?.superSetId === current.superSetId;
  if (prev && next) return 'middle';
  return prev ? 'last' : 'first';
}

function BuilderEditor({ initial, workoutId }: { initial: BuilderState; workoutId?: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [state, setState] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [saved, setSaved] = useState(false);
  // 3-dot menu flows, keyed by the exercise's builder key
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [supersetKey, setSupersetKey] = useState<string | null>(null);
  const [replaceKey, setReplaceKey] = useState<string | null>(null);
  const [replaceSearch, setReplaceSearch] = useState<{
    key: string;
    muscleGroupId: string | null;
  } | null>(null);

  const profile = useQuery(trpc.profile.get.queryOptions());
  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';
  const defaultVisibility = profile.data?.settings?.defaultWorkoutVisibility ?? 'private';

  const apply = (updater: (s: BuilderState) => BuilderState) => {
    setState(updater);
    setDirty(true);
  };

  // Discard-changes guard (FRONTEND.md §3.2) — data-router blocker intercepts back/nav
  const blocker = useBlocker(dirty && !saved);

  const invalidateWorkouts = () =>
    queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });

  const create = useMutation(
    trpc.workouts.create.mutationOptions({
      onSuccess: async () => {
        setSaved(true);
        await invalidateWorkouts();
        toast.success('Workout saved');
        navigate('/', { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't save the workout"),
    }),
  );
  const update = useMutation(
    trpc.workouts.update.mutationOptions({
      onSuccess: async (doc) => {
        setSaved(true);
        await invalidateWorkouts();
        toast.success('Workout updated');
        navigate(`/workout/${doc.id}`, { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't save the workout"),
    }),
  );
  const saving = create.isPending || update.isPending;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    apply((s) => {
      const from = s.exercises.findIndex((e) => e.key === active.id);
      const to = s.exercises.findIndex((e) => e.key === over.id);
      return moveExercise(s, from, to);
    });
  };

  const addedIds = useMemo(
    () => new Set(state.exercises.map((e) => e.exercise.id)),
    [state.exercises],
  );

  const exerciseByKey = (key: string | null) =>
    key === null ? undefined : state.exercises.find((e) => e.key === key);

  const doReplace = (key: string, entry: ExerciseIndexEntry) => {
    const current = exerciseByKey(key);
    if (!current) return;
    if (entry.id !== current.exercise.id && addedIds.has(entry.id)) {
      toast.error(`${entry.name} is already in this workout`);
      return;
    }
    apply((s) => replaceExercise(s, key, entry));
    setReplaceKey(null);
    setReplaceSearch(null);
    toast.success(`Swapped in ${entry.name} — sets kept`);
  };

  const openSave = () => {
    if (state.name.trim() === '') {
      setNameError(true);
      toast.error('Name your workout first');
      return;
    }
    if (state.exercises.length === 0) {
      toast.error('Add at least one exercise');
      return;
    }
    if (state.visibility === null) apply((s) => ({ ...s, visibility: defaultVisibility }));
    setSaveOpen(true);
  };

  const save = () => {
    const input = builderToInput(state);
    if (workoutId) update.mutate({ id: workoutId, ...input });
    else create.mutate(input);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-4">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Close builder"
          onClick={() => navigate(-1)}
        >
          <X />
        </Button>
        <h1 className="sr-only">{workoutId ? 'Edit workout' : 'New workout'}</h1>
        <div className="flex-1" />
        <Button size="lg" onClick={openSave} disabled={saving}>
          Save
        </Button>
      </header>

      <Input
        value={state.name}
        onChange={(e) => {
          setNameError(false);
          apply((s) => ({ ...s, name: e.target.value }));
        }}
        placeholder="Workout name"
        aria-label="Workout name"
        aria-invalid={nameError}
        className="text-h1 mt-2 h-14 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-input"
      />

      <div className="mt-4 flex-1 space-y-3 pb-32">
        {state.exercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No exercises yet"
            description="A workout is a list of exercises with sets — start by adding one."
            action={
              <Button size="xl" onClick={() => setPickerOpen(true)}>
                <Plus data-icon="inline-start" />
                Add exercise
              </Button>
            }
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={state.exercises.map((e) => e.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 pl-2">
                {state.exercises.map((item, index) => (
                  <ExerciseCard
                    key={item.key}
                    item={item}
                    unit={unit}
                    grouped={groupedPosition(state, index)}
                    onOpenMenu={() => setMenuKey(item.key)}
                    onPatchSet={(setKey, patch) =>
                      apply((s) => updateSet(s, item.key, setKey, patch))
                    }
                    onAddSet={() => apply((s) => addSet(s, item.key))}
                    onDuplicateSet={(setKey) => apply((s) => duplicateSet(s, item.key, setKey))}
                    onRemoveSet={(setKey) => apply((s) => removeSet(s, item.key, setKey))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {state.exercises.length > 0 && (
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={() => setPickerOpen(true)}
          >
            <Plus data-icon="inline-start" />
            Add exercise
          </Button>
        )}
      </div>

      <PickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        addedIds={addedIds}
        onToggle={(entry) => apply((s) => toggleExercise(s, entry))}
      />

      {/* 3-dot menu + its flows (mounted fresh per open so state seeds correctly) */}
      {(() => {
        const menuExercise = exerciseByKey(menuKey);
        return menuExercise ? (
          <ExerciseMenuSheet
            open
            exerciseName={menuExercise.exercise.name}
            inSuperset={menuExercise.superSetId !== null}
            onOpenChange={(next) => !next && setMenuKey(null)}
            onReplace={() => {
              setMenuKey(null);
              setReplaceKey(menuExercise.key);
            }}
            onSuperset={() => {
              setMenuKey(null);
              setSupersetKey(menuExercise.key);
            }}
            onRemove={() => {
              setMenuKey(null);
              apply((s) => removeExercise(s, menuExercise.key));
            }}
          />
        ) : null;
      })()}

      {(() => {
        const anchor = exerciseByKey(supersetKey);
        return anchor ? (
          <SupersetSheet
            anchor={anchor}
            others={state.exercises.filter((e) => e.key !== anchor.key)}
            onOpenChange={(next) => !next && setSupersetKey(null)}
            onConfirm={(memberKeys) => {
              apply((s) => buildSuperset(s, anchor.key, memberKeys));
              setSupersetKey(null);
            }}
          />
        ) : null;
      })()}

      {(() => {
        const replacing = exerciseByKey(replaceKey);
        return replacing ? (
          <ReplaceSheet
            exercise={replacing}
            addedIds={addedIds}
            onOpenChange={(next) => !next && setReplaceKey(null)}
            onPick={(entry) => doReplace(replacing.key, entry)}
            onSearchAll={(muscleGroupId) => {
              setReplaceKey(null);
              setReplaceSearch({ key: replacing.key, muscleGroupId });
            }}
          />
        ) : null;
      })()}

      {replaceSearch && (
        <PickerSheet
          open
          mode="pick"
          sheetTitle="Choose a replacement"
          initialMuscleId={replaceSearch.muscleGroupId}
          addedIds={addedIds}
          onToggle={() => undefined}
          onPick={(entry) => doReplace(replaceSearch.key, entry)}
          onOpenChange={(next) => !next && setReplaceSearch(null)}
        />
      )}

      <SaveSheet
        open={saveOpen}
        onOpenChange={setSaveOpen}
        scheduledFor={state.scheduledFor}
        onScheduledForChange={(date) => apply((s) => ({ ...s, scheduledFor: date }))}
        visibility={state.visibility ?? defaultVisibility}
        onVisibilityChange={(v) => apply((s) => ({ ...s, visibility: v }))}
        saving={saving}
        onSave={save}
        saveLabel={workoutId ? 'Save changes' : 'Save workout'}
      />

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.reset?.()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard changes?</DialogTitle>
            <DialogDescription>Your edits to this workout won't be saved.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button variant="destructive" size="lg" onClick={() => blocker.proceed?.()}>
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Serves /workout/new and /workout/:id/edit (planned workouts only, ADR-0003). */
export default function BuilderPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const doc = useQuery(trpc.workouts.byId.queryOptions({ id: id ?? '' }, { enabled: !!id }));

  if (!id) return <BuilderEditor initial={emptyBuilder()} />;

  if (doc.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (doc.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <ErrorCard message="This workout isn't available." onRetry={() => void doc.refetch()} />
      </div>
    );
  }
  if (doc.data.status !== 'planned') return <Navigate to={`/workout/${id}`} replace />;

  return (
    <BuilderEditor
      key={doc.data.id}
      initial={builderFromDoc(doc.data as WorkoutDoc)}
      workoutId={id}
    />
  );
}
