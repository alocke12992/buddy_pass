import type { UnitPreference } from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, EllipsisVertical, FastForward, Flag, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExerciseIndexEntry, WorkoutDoc } from '@/lib/api-types';
import { formatDuration, steppedWeightKg } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { ExerciseMenuSheet } from './exercises/ExerciseMenuSheet';
import { PickerSheet } from './exercises/PickerSheet';
import { ReplaceSheet } from './exercises/ReplaceSheet';
import { DeleteSetDialog } from './live/DeleteSetDialog';
import { LiveSetRow } from './live/LiveSetRow';
import { SetMenuSheet } from './live/SetMenuSheet';
import {
  livePlan,
  buildDisplayGroups,
  countSets,
  currentSetId,
  type DisplayGroup,
  type DisplayRow,
  type DocExercise,
} from './live/order';
import {
  extendTimerNow,
  formatSeconds,
  idleTimer,
  isRunning,
  remainingSeconds,
  startTimerNow,
  type RestTimerState,
} from './live/restTimer';

/** Coarse clock for the elapsed + rest readouts (timestamp-derived, no drift). */
function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

type DocSet = WorkoutDoc['exercises'][number]['sets'][number];

type SetPatch = Partial<{
  reps: number;
  weightKg: number;
  completedAt: Date | null;
}>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Superset rows interleave, so they name their movement; plain ones just count. */
const rowLabel = (group: DisplayGroup, row: DisplayRow) =>
  group.isSuperset
    ? `${row.exercise.exercise.name} · set ${row.setIndex + 1}`
    : `Set ${row.setIndex + 1}`;

/** The design-target screen (FRONTEND.md §3.3): full-screen, no tab bar. */
export default function LivePage() {
  const { id = '' } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const now = useNow();

  const queryOptions = trpc.workouts.byId.queryOptions({ id });
  const doc = useQuery(queryOptions);
  const queryKey = trpc.workouts.byId.queryKey({ id });

  const [timer, setTimer] = useState<RestTimerState>(idleTimer);
  const [finishOpen, setFinishOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Per-set overflow, then (for logged work only) a confirm. Labels are snapshotted for the copy.
  const [setMenu, setSetMenu] = useState<{ row: DisplayRow; label: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ setId: string; label: string } | null>(null);
  // Plan edits (ADR-0004), keyed by workout_exercise id
  const [pickerOpen, setPickerOpen] = useState(false);
  const [staged, setStaged] = useState<ExerciseIndexEntry[]>([]);
  const [exerciseMenuId, setExerciseMenuId] = useState<string | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceSearch, setReplaceSearch] = useState<{
    id: string;
    muscleGroupId: string | null;
  } | null>(null);

  const profile = useQuery(trpc.profile.get.queryOptions());
  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';

  // --- optimistic cache patching -------------------------------------------
  const patchDocSets = (rewrite: (sets: DocSet[]) => DocSet[]) => {
    queryClient.setQueryData(queryKey, (old: WorkoutDoc | undefined) =>
      old
        ? { ...old, exercises: old.exercises.map((e) => ({ ...e, sets: rewrite(e.sets) })) }
        : old,
    );
  };

  const patchSetInCache = (setId: string, patch: SetPatch) =>
    patchDocSets((sets) => sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)));

  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey });
    return queryClient.getQueryData<WorkoutDoc>(queryKey);
  };
  const rollback = (prev: WorkoutDoc | undefined) => {
    if (prev) queryClient.setQueryData(queryKey, prev);
  };

  const completeSet = useMutation(
    trpc.logging.completeSet.mutationOptions({
      onMutate: async (vars) => {
        const prev = await snapshot();
        patchSetInCache(vars.setId, {
          completedAt: new Date(),
          ...(vars.reps !== undefined && { reps: vars.reps }),
          ...(vars.weightKg !== undefined && { weightKg: vars.weightKg }),
        });
        return { prev };
      },
      onError: (e, _v, ctx) => {
        rollback(ctx?.prev);
        toast.error(e.message || "Couldn't complete the set");
      },
    }),
  );

  const uncompleteSet = useMutation(
    trpc.logging.uncompleteSet.mutationOptions({
      onMutate: async (vars) => {
        const prev = await snapshot();
        patchSetInCache(vars.setId, { completedAt: null });
        return { prev };
      },
      onError: (e, _v, ctx) => {
        rollback(ctx?.prev);
        toast.error(e.message || "Couldn't undo the set");
      },
    }),
  );

  const updateSet = useMutation(
    trpc.logging.updateSet.mutationOptions({
      onError: (e) => {
        void queryClient.invalidateQueries({ queryKey });
        toast.error(e.message || "Couldn't save the change");
      },
    }),
  );

  // Stepper edits: patch the cache instantly, debounce the server write per set
  const pendingEdits = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const editSet = (setId: string, patch: { reps?: number; weightKg?: number }) => {
    patchSetInCache(setId, patch);
    const timers = pendingEdits.current;
    clearTimeout(timers.get(setId));
    timers.set(
      setId,
      setTimeout(() => {
        const current = queryClient
          .getQueryData<WorkoutDoc>(queryKey)
          ?.exercises.flatMap((e) => e.sets)
          .find((s) => s.id === setId);
        if (current) {
          updateSet.mutate({
            setId,
            reps: current.reps,
            weightKg: current.weightKg ?? 0,
          });
        }
        timers.delete(setId);
      }, 600),
    );
  };
  useEffect(() => {
    const timers = pendingEdits.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const addSet = useMutation(
    trpc.logging.addSet.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
      onError: (e) => toast.error(e.message || "Couldn't add a set"),
    }),
  );

  // A delete reshuffles no ids, so the row can go instantly; the list views carry
  // set counts of their own, hence the wider invalidation once it lands.
  const removeSet = useMutation(
    trpc.logging.removeSet.mutationOptions({
      onMutate: async (vars) => {
        const prev = await snapshot();
        patchDocSets((sets) => sets.filter((s) => s.id !== vars.setId));
        return { prev };
      },
      onError: (e, _v, ctx) => {
        rollback(ctx?.prev);
        toast.error(e.message || "Couldn't delete the set");
      },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() }),
    }),
  );

  // Structure edits reshuffle ids, so the server's document replaces the cache wholesale
  const seedDoc = (next: WorkoutDoc) => queryClient.setQueryData(queryKey, next);

  const addExercises = useMutation(
    trpc.logging.addExercises.mutationOptions({
      onSuccess: (next) => {
        // count from the document: the server skips ids already in the plan
        const before = queryClient.getQueryData<WorkoutDoc>(queryKey)?.exercises.length ?? 0;
        seedDoc(next);
        const added = next.exercises.length - before;
        if (added > 0) toast(`Added ${plural(added, 'exercise')}`);
      },
      onError: (e) => toast.error(e.message || "Couldn't add the exercises"),
    }),
  );

  const replaceExercise = useMutation(
    trpc.logging.replaceExercise.mutationOptions({
      onSuccess: (next) => seedDoc(next),
      onError: (e) => toast.error(e.message || "Couldn't swap the exercise"),
    }),
  );

  const removeExercise = useMutation(
    trpc.logging.removeExercise.mutationOptions({
      onSuccess: (next) => seedDoc(next),
      onError: (e) => toast.error(e.message || "Couldn't remove the exercise"),
    }),
  );

  const finish = useMutation(
    trpc.logging.finish.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });
        navigate(`/workout/${id}/summary`, { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't finish the workout"),
    }),
  );

  const cancel = useMutation(
    trpc.logging.cancel.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });
        toast('Workout cancelled');
        navigate('/', { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't cancel the workout"),
    }),
  );

  // --- render guards --------------------------------------------------------
  if (doc.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
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
  if (doc.data.status === 'completed') return <Navigate to={`/workout/${id}/summary`} replace />;
  if (doc.data.status !== 'in_progress') return <Navigate to={`/workout/${id}`} replace />;

  // Dropped exercises stay in the document but off the live plan (ADR-0004);
  // their completed sets still count in the header total.
  const plan = livePlan(doc.data);
  const planIds = new Set(plan.map((e) => e.exercise.id));
  const groups = buildDisplayGroups(plan);
  const activeSetId = currentSetId(groups);
  const { completed, total } = countSets(doc.data);
  const remaining = total - completed;
  const elapsed = doc.data.startedAt ? now - doc.data.startedAt.getTime() : 0;
  const resting = isRunning(timer, now);
  const restLeft = remainingSeconds(timer, now);

  const toggleComplete = (
    setId: string,
    isCompleted: boolean,
    restSeconds: number,
    isLast: boolean,
  ) => {
    if (isCompleted) {
      uncompleteSet.mutate({ setId });
      return;
    }
    const current = doc.data.exercises.flatMap((e) => e.sets).find((s) => s.id === setId);
    completeSet.mutate({
      setId,
      reps: current?.reps,
      weightKg: current?.weightKg ?? 0,
    });
    // Rest auto-plays except after an exercise's final set (MVP.md §5)
    if (!isLast && restSeconds > 0) setTimer(startTimerNow(restSeconds));
  };

  const completeCurrent = () => {
    if (!activeSetId) return;
    for (const group of groups) {
      const row = group.rows.find((r) => r.set.id === activeSetId);
      if (row) {
        toggleComplete(row.set.id, false, row.set.restSeconds, row.isLastSetOfExercise);
        return;
      }
    }
  };

  /** Logged work gets a confirm; a set you just added goes straight from the menu. */
  const requestDeleteSet = (row: DisplayRow, label: string) => {
    setSetMenu(null);
    if (row.set.completedAt !== null) setPendingDelete({ setId: row.set.id, label });
    else removeSet.mutate({ setId: row.set.id });
  };

  const closePicker = () => {
    setPickerOpen(false);
    setStaged([]);
  };

  /** Sets already logged in a slot survive it being dropped — say so, or the user assumes they didn't. */
  const keptNote = (slot: DocExercise) => {
    const logged = slot.sets.filter((s) => s.completedAt !== null).length;
    return logged > 0 ? ` — ${plural(logged, 'logged set')} stay on your record` : '';
  };

  const doReplace = (slot: DocExercise, entry: ExerciseIndexEntry) => {
    setReplaceId(null);
    setReplaceSearch(null);
    const message = `Swapped ${slot.exercise.name} → ${entry.name}${keptNote(slot)}`;
    replaceExercise.mutate(
      { workoutExerciseId: slot.id, exerciseId: entry.id },
      { onSuccess: () => toast(message) },
    );
  };

  const doRemove = (slot: DocExercise) => {
    setExerciseMenuId(null);
    const message = `Removed ${slot.exercise.name}${keptNote(slot)}`;
    removeExercise.mutate({ workoutExerciseId: slot.id }, { onSuccess: () => toast(message) });
  };

  // All sets done → no confirmation needed (FRONTEND.md §3.3)
  const requestFinish = () => {
    if (remaining > 0) setFinishOpen(true);
    else finish.mutate({ workoutId: id });
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {/* Header: name, elapsed, overflow */}
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b bg-background/95 px-2 py-2 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Back to Home (workout stays in progress)"
          onClick={() => navigate('/')}
        >
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{doc.data.name}</h1>
          <p className="numeric text-xs text-muted-foreground">
            {formatDuration(elapsed)} · {completed}/{total} sets
          </p>
        </div>
        <Button size="lg" variant="outline" disabled={finish.isPending} onClick={requestFinish}>
          <Flag data-icon="inline-start" />
          Finish
        </Button>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="More options"
          onClick={() => setMenuOpen(true)}
        >
          <EllipsisVertical />
        </Button>
      </header>

      {/* Exercise groups */}
      <main className="flex-1 space-y-5 px-4 pt-4 pb-52">
        {groups.map((group) => (
          <section
            key={group.key}
            className={cn(group.isSuperset && 'rounded-2xl border border-primary/30 p-3')}
          >
            {group.isSuperset && <p className="text-label mb-2 text-primary">Superset</p>}
            {!group.isSuperset && (
              <h2 className="text-h2 mb-2 truncate">{group.exercises[0]!.exercise.name}</h2>
            )}
            <div className="space-y-2">
              {group.rows.map((row) => {
                const label = rowLabel(group, row);
                return (
                  <LiveSetRow
                    key={row.set.id}
                    row={row}
                    label={label}
                    isCurrent={row.set.id === activeSetId}
                    unit={unit}
                    editable
                    onDeltaReps={(d) =>
                      editSet(row.set.id, { reps: Math.max(0, row.set.reps + d) })
                    }
                    onStepWeight={(direction) =>
                      editSet(row.set.id, {
                        weightKg: steppedWeightKg(row.set.weightKg ?? 0, direction, unit),
                      })
                    }
                    onToggleComplete={() =>
                      toggleComplete(
                        row.set.id,
                        row.set.completedAt !== null,
                        row.set.restSeconds,
                        row.isLastSetOfExercise,
                      )
                    }
                    onOpenMenu={() => setSetMenu({ row, label })}
                  />
                );
              })}
            </div>
            {group.exercises.map((e) => (
              <div key={e.id} className="mt-1 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="lg"
                  className="min-w-0 flex-1 text-muted-foreground"
                  disabled={addSet.isPending}
                  onClick={() => addSet.mutate({ workoutExerciseId: e.id })}
                >
                  <Plus data-icon="inline-start" />
                  Add set{group.isSuperset ? ` · ${e.exercise.name}` : ''}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xl"
                  aria-label={`Options for ${e.exercise.name}`}
                  onClick={() => setExerciseMenuId(e.id)}
                >
                  <EllipsisVertical className="text-muted-foreground" />
                </Button>
              </div>
            ))}
          </section>
        ))}

        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing left in this workout — add an exercise or finish up.
          </p>
        )}

        {/* Mid-workout plan edits (ADR-0004) */}
        <Button
          variant="outline"
          size="xl"
          className="w-full"
          disabled={addExercises.isPending}
          onClick={() => setPickerOpen(true)}
        >
          <Plus data-icon="inline-start" />
          Add exercises
        </Button>
      </main>

      {/* Sticky bottom bar: rest timer or the primary action (thumb zone) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 py-3">
          {resting && (
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="icon-workout"
                aria-label="15 seconds less rest"
                onClick={() => setTimer((t) => extendTimerNow(t, -15))}
              >
                <Minus />
              </Button>
              <div className="numeric text-center">
                <div className="text-display text-primary">{formatSeconds(restLeft)}</div>
                <div className="text-label text-faint">Rest</div>
              </div>
              <Button
                variant="outline"
                size="icon-workout"
                aria-label="15 seconds more rest"
                onClick={() => setTimer((t) => extendTimerNow(t, 15))}
              >
                <Plus />
              </Button>
              <Button
                variant="outline"
                size="workout"
                aria-label="Skip rest"
                onClick={() => setTimer(idleTimer)}
              >
                <FastForward data-icon="inline-start" />
                Skip
              </Button>
            </div>
          )}
          {!resting &&
            (activeSetId ? (
              <Button size="workout" className="w-full" onClick={completeCurrent}>
                Complete set
              </Button>
            ) : (
              <Button
                size="workout"
                className="w-full"
                disabled={finish.isPending}
                onClick={requestFinish}
              >
                <Flag data-icon="inline-start" />
                Finish workout
              </Button>
            ))}
        </div>
      </div>

      {/* Add exercises: selection is staged locally, then committed in one call */}
      {pickerOpen && (
        <PickerSheet
          open
          sheetTitle="Add exercises"
          addedIds={new Set([...planIds, ...staged.map((e) => e.id)])}
          lockedIds={planIds}
          onToggle={(entry) =>
            setStaged((current) =>
              current.some((e) => e.id === entry.id)
                ? current.filter((e) => e.id !== entry.id)
                : [...current, entry],
            )
          }
          doneLabel={staged.length > 0 ? `Add ${plural(staged.length, 'exercise')}` : 'Done'}
          onDone={() => {
            if (staged.length > 0) {
              addExercises.mutate({ workoutId: id, exerciseIds: staged.map((e) => e.id) });
            }
            closePicker();
          }}
          onOpenChange={(next) => !next && closePicker()}
        />
      )}

      {/* Per-exercise 3-dot menu → replace / remove (supersets stay as built) */}
      {(() => {
        const slot = plan.find((e) => e.id === exerciseMenuId);
        return slot ? (
          <ExerciseMenuSheet
            open
            exerciseName={slot.exercise.name}
            inSuperset={slot.superSetId !== null}
            onOpenChange={(next) => !next && setExerciseMenuId(null)}
            onReplace={() => {
              setExerciseMenuId(null);
              setReplaceId(slot.id);
            }}
            onRemove={() => doRemove(slot)}
          />
        ) : null;
      })()}

      {(() => {
        const slot = plan.find((e) => e.id === replaceId);
        return slot ? (
          <ReplaceSheet
            target={slot.exercise}
            description="Similar movements — sets come from the last time you did them."
            addedIds={planIds}
            onOpenChange={(next) => !next && setReplaceId(null)}
            onPick={(entry) => doReplace(slot, entry)}
            onSearchAll={(muscleGroupId) => {
              setReplaceId(null);
              setReplaceSearch({ id: slot.id, muscleGroupId });
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
          addedIds={planIds}
          onToggle={() => undefined}
          onPick={(entry) => {
            const slot = plan.find((e) => e.id === replaceSearch.id);
            if (slot) doReplace(slot, entry);
          }}
          onOpenChange={(next) => !next && setReplaceSearch(null)}
        />
      )}

      {/* Per-set 3-dot menu → delete (logged sets then confirm) */}
      <SetMenuSheet
        open={setMenu !== null}
        label={setMenu?.label ?? ''}
        onOpenChange={(next) => !next && setSetMenu(null)}
        onDelete={() => {
          if (setMenu) requestDeleteSet(setMenu.row, setMenu.label);
        }}
      />

      <DeleteSetDialog
        open={pendingDelete !== null}
        label={pendingDelete?.label ?? ''}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) removeSet.mutate({ setId: pendingDelete.setId });
          setPendingDelete(null);
        }}
      />

      {/* Finish confirmation (only warns when sets remain) */}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {remaining > 0
                ? `${remaining} set${remaining === 1 ? '' : 's'} unfinished — finish anyway?`
                : 'Finish workout?'}
            </DialogTitle>
            <DialogDescription>
              {remaining > 0
                ? 'Unfinished sets are simply left out of your stats.'
                : 'Nice work — this wraps up the session.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setFinishOpen(false)}>
              Keep going
            </Button>
            <Button
              size="lg"
              disabled={finish.isPending}
              onClick={() => finish.mutate({ workoutId: id })}
            >
              Finish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overflow menu → cancel */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader>
            <SheetTitle>Workout options</SheetTitle>
            <SheetDescription className="sr-only">More actions</SheetDescription>
          </SheetHeader>
          <div className="p-4 pt-0">
            <Button
              variant="destructive"
              size="xl"
              className="w-full"
              onClick={() => {
                setMenuOpen(false);
                setCancelOpen(true);
              }}
            >
              Cancel workout
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this workout?</DialogTitle>
            <DialogDescription>
              It'll be marked cancelled — logged sets stay on record but won't count toward stats.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setCancelOpen(false)}>
              Keep going
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ workoutId: id })}
            >
              Cancel workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
