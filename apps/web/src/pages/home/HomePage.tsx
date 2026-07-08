import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Copy, Dumbbell, Pencil, Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/EmptyState';
import { ErrorCard } from '@/components/app/ErrorCard';
import { RescheduleSheet } from '@/components/app/RescheduleSheet';
import { StatusBadge } from '@/components/app/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { WorkoutSummary } from '@/lib/api-types';
import { formatScheduleDate } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { pickHeroWorkout } from '@/lib/workouts';

function HeroCard({ workout, inProgress }: { workout: WorkoutSummary; inProgress: boolean }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const start = useMutation(
    trpc.logging.start.mutationOptions({
      onSuccess: async (doc) => {
        await queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });
        navigate(`/workout/${doc.id}/live`);
      },
      onError: (e) => toast.error(e.message || "Couldn't start the workout"),
    }),
  );

  return (
    <section
      aria-label={inProgress ? 'Workout in progress' : 'Next workout'}
      className="rounded-2xl border bg-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <StatusBadge status={inProgress ? 'in_progress' : 'planned'} />
          <h2 className="text-h1 truncate">{workout.name}</h2>
          <p className="numeric text-sm text-muted-foreground">
            {workout.exerciseCount} exercise{workout.exerciseCount === 1 ? '' : 's'} ·{' '}
            {workout.setCount} set{workout.setCount === 1 ? '' : 's'}
            {workout.scheduledFor && ` · ${formatScheduleDate(workout.scheduledFor)}`}
          </p>
          {workout.originWorkoutId && (
            <p className="flex items-center gap-1 text-xs text-secondary">
              <Copy aria-hidden className="size-3.5" />
              Cloned workout
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {inProgress ? (
          <Button
            size="workout"
            className="w-full"
            onClick={() => navigate(`/workout/${workout.id}/live`)}
          >
            <Play data-icon="inline-start" />
            Resume workout
          </Button>
        ) : (
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
        )}
        {!inProgress && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="xl" onClick={() => setRescheduleOpen(true)}>
              <CalendarClock data-icon="inline-start" />
              Reschedule
            </Button>
            <Button
              variant="outline"
              size="xl"
              render={<Link to={`/workout/${workout.id}/edit`} />}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </div>
        )}
      </div>

      <RescheduleSheet
        workoutId={workout.id}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
    </section>
  );
}

/** The launcher (FRONTEND.md §3.1): exactly one hero card, no lists. */
export default function HomePage() {
  const trpc = useTRPC();
  const inProgress = useQuery(trpc.workouts.list.queryOptions({ status: 'in_progress', limit: 5 }));
  const planned = useQuery(trpc.workouts.list.queryOptions({ status: 'planned', limit: 100 }));

  const isPending = inProgress.isPending || planned.isPending;
  const isError = inProgress.isError || planned.isError;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-h1">Home</h1>
        <Button size="lg" render={<Link to="/workout/new" />}>
          <Plus data-icon="inline-start" />
          New workout
        </Button>
      </header>

      {isPending ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorCard
          onRetry={() => {
            void inProgress.refetch();
            void planned.refetch();
          }}
        />
      ) : (
        (() => {
          const pick = pickHeroWorkout(inProgress.data.items, planned.data.items);
          if (pick.kind === 'empty') {
            return (
              <EmptyState
                icon={Dumbbell}
                title="No workout planned"
                description="Build one from 800+ exercises — it takes a minute."
                action={
                  <Button size="xl" render={<Link to="/workout/new" />}>
                    <Plus data-icon="inline-start" />
                    Create a workout
                  </Button>
                }
              />
            );
          }
          return <HeroCard workout={pick.workout} inProgress={pick.kind === 'in_progress'} />;
        })()
      )}
    </div>
  );
}
