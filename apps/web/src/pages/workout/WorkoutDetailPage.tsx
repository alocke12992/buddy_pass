import type { UnitPreference } from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  Copy,
  EyeOff,
  Lock,
  Pencil,
  Play,
  Repeat2,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/EmptyState';
import { RescheduleSheet } from '@/components/app/RescheduleSheet';
import { StatusBadge } from '@/components/app/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import type { WorkoutDoc } from '@/lib/api-types';
import { formatDuration, formatWeight } from '@/lib/format';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { buildDisplayGroups, completedVolumeKg, countSets } from './live/order';

function ExerciseList({ doc, unit }: { doc: WorkoutDoc; unit: UnitPreference }) {
  const groups = buildDisplayGroups(doc);
  const showChecks = doc.status === 'completed' || doc.status === 'cancelled';
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={group.key}
          className={cn(group.isSuperset && 'rounded-2xl border border-primary/30 p-3')}
        >
          {group.isSuperset && <p className="text-label mb-2 text-primary">Superset</p>}
          {group.exercises.map((we) => (
            <div key={we.id} className="mb-3 last:mb-0">
              <h3 className="mb-1.5 truncate text-sm font-semibold">{we.exercise.name}</h3>
              <ul className="divide-y rounded-xl border bg-card">
                {we.sets.map((set, i) => (
                  <li key={set.id} className="numeric flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-6 shrink-0 text-faint">{set.isWarmup ? 'W' : i + 1}</span>
                    <span className="flex-1 text-foreground">
                      {set.reps} reps · {formatWeight(set.weightKg ?? 0, unit)}
                    </span>
                    {showChecks && (
                      <Check
                        aria-label={set.completedAt ? 'Completed' : 'Not completed'}
                        className={cn(
                          'size-4',
                          set.completedAt ? 'text-primary' : 'text-faint opacity-40',
                        )}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** One read-only screen, three contexts (FRONTEND.md §3.6). */
export default function WorkoutDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthentication();

  const doc = useQuery(trpc.workouts.byId.queryOptions({ id }));
  const profile = useQuery(trpc.profile.get.queryOptions());
  const friends = useQuery(trpc.friends.list.queryOptions());
  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });

  const start = useMutation(
    trpc.logging.start.mutationOptions({
      onSuccess: async (started) => {
        await invalidate();
        navigate(`/workout/${started.id}/live`);
      },
      onError: (e) => toast.error(e.message || "Couldn't start the workout"),
    }),
  );

  const clone = useMutation(
    trpc.workouts.clone.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Added to your plan — it's on Home");
        navigate('/');
      },
      onError: (e) => toast.error(e.message || "Couldn't copy the workout"),
    }),
  );

  const remove = useMutation(
    trpc.workouts.delete.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast('Workout deleted');
        navigate('/log', { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't delete the workout"),
    }),
  );

  if (doc.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (doc.isError) {
    const code = trpcErrorCode(doc.error);
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl items-center px-4">
        <div className="w-full">
          <EmptyState
            icon={code === 'FORBIDDEN' ? Lock : EyeOff}
            title="This workout isn't available"
            description={
              code === 'FORBIDDEN'
                ? "It's private — only its owner and their buddies can see it."
                : 'It may have been deleted, or the link is wrong.'
            }
            action={
              <Button variant="outline" size="lg" render={<Link to="/" />}>
                Back home
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const workout = doc.data;
  const own = workout.ownerId === user?.id;
  const friendName = friends.data?.find((f) => f.id === workout.ownerId)?.name;
  const { completed, total } = countSets(workout);
  const volume = completedVolumeKg(workout);
  const duration =
    workout.startedAt && workout.endedAt
      ? workout.endedAt.getTime() - workout.startedAt.getTime()
      : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 py-4">
      <header className="flex items-center gap-1">
        <Button variant="ghost" size="icon-xl" aria-label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft />
        </Button>
        <div className="flex-1" />
        <StatusBadge status={workout.status} />
      </header>

      <div className="space-y-2">
        <h1 className="text-h1">{workout.name}</h1>
        {!own && (
          <p className="flex items-center gap-1.5 text-sm text-secondary">
            <Users aria-hidden className="size-4" />
            From {friendName ?? 'a buddy'}
          </p>
        )}
        {own && workout.originWorkoutId && (
          <p className="flex items-center gap-1.5 text-sm text-secondary">
            <Copy aria-hidden className="size-4" />
            Cloned workout
          </p>
        )}
        <p className="numeric text-sm text-muted-foreground">
          {workout.exerciseCount} exercise{workout.exerciseCount === 1 ? '' : 's'} ·{' '}
          {workout.status === 'completed' || workout.status === 'cancelled'
            ? `${completed}/${total} sets`
            : `${total} sets`}
          {duration !== null && ` · ${formatDuration(duration)}`}
          {workout.status === 'completed' && ` · ${formatWeight(volume, unit)}`}
        </p>
        {own && (
          <Badge variant="outline" className="text-muted-foreground">
            {workout.visibility === 'friends' ? 'Visible to friends' : 'Private'}
          </Badge>
        )}
        {workout.notes && <p className="text-sm text-muted-foreground">{workout.notes}</p>}
      </div>

      {/* Context actions */}
      <div className="space-y-2">
        {own && workout.status === 'planned' && (
          <>
            <Button
              size="workout"
              className="w-full"
              disabled={start.isPending}
              onClick={() => start.mutate({ workoutId: workout.id })}
            >
              {start.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              Start
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="xl"
                render={<Link to={`/workout/${workout.id}/edit`} />}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              <Button variant="outline" size="xl" onClick={() => setRescheduleOpen(true)}>
                <CalendarClock data-icon="inline-start" />
                Move
              </Button>
              <Button variant="outline" size="xl" onClick={() => setDeleteOpen(true)}>
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </div>
          </>
        )}
        {own && workout.status === 'in_progress' && (
          <Button
            size="workout"
            className="w-full"
            render={<Link to={`/workout/${workout.id}/live`} />}
          >
            <Play data-icon="inline-start" />
            Resume workout
          </Button>
        )}
        {own && (workout.status === 'completed' || workout.status === 'cancelled') && (
          <Button
            size="workout"
            className="w-full"
            disabled={clone.isPending}
            onClick={() => clone.mutate({ source: { workoutId: workout.id } })}
          >
            {clone.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Repeat2 data-icon="inline-start" />
            )}
            Repeat workout
          </Button>
        )}
        {!own && (
          <Button
            size="workout"
            className="w-full"
            disabled={clone.isPending}
            onClick={() => clone.mutate({ source: { workoutId: workout.id } })}
          >
            {clone.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Copy data-icon="inline-start" />
            )}
            Clone this workout
          </Button>
        )}
      </div>

      <ExerciseList doc={workout} unit={unit} />

      <RescheduleSheet
        workoutId={workout.id}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this workout?</DialogTitle>
            <DialogDescription>This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: workout.id })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
