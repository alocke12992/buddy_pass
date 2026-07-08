import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/app/EmptyState';
import { ErrorCard } from '@/components/app/ErrorCard';
import { StatusBadge } from '@/components/app/StatusBadge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkoutSummary } from '@/lib/api-types';
import { formatDuration, formatScheduleDate } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { calendarDots, listForSelection, workoutDate } from './logData';

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-xl border bg-card p-3 text-center">
      <div className="numeric text-stat text-primary">{value}</div>
      <div className="text-label mt-0.5 text-faint">{label}</div>
    </div>
  );
}

function WorkoutRow({ workout }: { workout: WorkoutSummary }) {
  const date = workoutDate(workout);
  const duration =
    workout.startedAt && workout.endedAt
      ? formatDuration(workout.endedAt.getTime() - workout.startedAt.getTime())
      : null;
  return (
    <Link
      to={`/workout/${workout.id}`}
      className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{workout.name}</p>
        <p className="numeric truncate text-sm text-muted-foreground">
          {date ? formatScheduleDate(date) : 'Unscheduled'}
          {duration && ` · ${duration}`} · {workout.exerciseCount} exercise
          {workout.exerciseCount === 1 ? '' : 's'} · {workout.setCount} set
          {workout.setCount === 1 ? '' : 's'}
        </p>
      </div>
      <StatusBadge status={workout.status} />
    </Link>
  );
}

/** The time view (FRONTEND.md §3.5). Goal ring + streak are deferred post-MVP (WEB.md §2a). */
export default function LogPage() {
  const trpc = useTRPC();
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // MVP cap: one page of 100 covers months of use; cursor paging can come later
  const workouts = useQuery(trpc.workouts.list.queryOptions({ limit: 100 }));
  const summary = useQuery(trpc.stats.summary.queryOptions({}));

  if (workouts.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="text-h1">Log</h1>
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (workouts.isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-h1">Log</h1>
        <ErrorCard onRetry={() => void workouts.refetch()} />
      </div>
    );
  }

  const items = workouts.data.items;
  const dots = calendarDots(items);
  const list = listForSelection(items, selectedDay);

  return (
    <div className="space-y-5">
      <h1 className="text-h1">Log</h1>

      {items.length === 0 ? (
        <EmptyState
          icon={CalendarPlus}
          title="Nothing logged yet"
          description="Your history and plans land here once you build a workout."
          action={
            <Button size="xl" render={<Link to="/workout/new" />}>
              <Plus data-icon="inline-start" />
              Create a workout
            </Button>
          }
        />
      ) : (
        <>
          <div className="rounded-2xl border bg-card p-2">
            <Calendar
              mode="single"
              selected={selectedDay ?? undefined}
              onSelect={(day) => setSelectedDay(day ?? null)}
              modifiers={{ completed: dots.completed, planned: dots.planned }}
              modifiersClassNames={{
                completed: 'log-day-completed',
                planned: 'log-day-planned',
              }}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <StatTile label="This week" value={summary.data?.currentWeekCount ?? '–'} />
            <StatTile label="Workouts done" value={summary.data?.workoutsCompleted ?? '–'} />
          </div>

          {selectedDay && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {formatScheduleDate(selectedDay)}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDay(null)}>
                <X data-icon="inline-start" />
                Clear
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {list.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {selectedDay ? 'Nothing on this day.' : 'No workouts logged yet.'}
              </p>
            ) : (
              list.map((w) => <WorkoutRow key={w.id} workout={w} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
