import type { UnitPreference } from '@buddy-pass/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Share2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { ErrorCard } from '@/components/app/ErrorCard';
import { ShareSheet } from '@/components/app/ShareSheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthentication } from '@/context/Authentication';
import { formatDuration, formatWeight } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { completedVolumeKg, countSets } from './live/order';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <div className="numeric text-stat text-primary">{value}</div>
      <div className="text-label mt-1 text-faint">{label}</div>
    </div>
  );
}

/** Post-workout summary (FRONTEND.md §3.4). No PR callouts (open Q2). */
export default function SummaryPage() {
  const { id = '' } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const { user } = useAuthentication();
  const [shareOpen, setShareOpen] = useState(false);

  const doc = useQuery(trpc.workouts.byId.queryOptions({ id }));
  const profile = useQuery(trpc.profile.get.queryOptions());
  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';

  if (doc.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-28 w-full" />
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
  if (doc.data.status === 'in_progress') return <Navigate to={`/workout/${id}/live`} replace />;
  if (doc.data.status === 'planned') return <Navigate to={`/workout/${id}`} replace />;

  const { completed, total } = countSets(doc.data);
  const volume = completedVolumeKg(doc.data);
  const duration =
    doc.data.startedAt && doc.data.endedAt
      ? doc.data.endedAt.getTime() - doc.data.startedAt.getTime()
      : 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="space-y-1 text-center">
        <Sparkles aria-hidden className="mx-auto size-8 text-primary" />
        <h1 className="text-h1">
          {doc.data.status === 'cancelled' ? 'Workout cancelled' : 'Workout complete'}
        </h1>
        <p className="text-muted-foreground">{doc.data.name}</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Duration" value={formatDuration(duration)} />
        <Stat label="Volume" value={formatWeight(volume, unit)} />
        <Stat label="Sets" value={`${completed}/${total}`} />
      </div>

      <section className="space-y-2">
        <h2 className="text-h2">Exercises</h2>
        <ul className="divide-y rounded-xl border bg-card">
          {doc.data.exercises.map((we) => {
            const done = we.sets.filter((s) => s.completedAt !== null);
            const exVolume = done
              .filter((s) => !s.isWarmup)
              .reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0);
            return (
              <li key={we.id} className="flex items-center gap-3 px-4 py-3">
                <Check
                  aria-hidden
                  className={
                    done.length === we.sets.length ? 'size-5 text-primary' : 'size-5 text-faint'
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{we.exercise.name}</p>
                  <p className="numeric text-xs text-muted-foreground">
                    {done.length}/{we.sets.length} sets · {formatWeight(exVolume, unit)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {user?.isAnonymous && (
        <section className="rounded-xl border border-primary/40 bg-primary/10 p-4">
          <p className="font-medium">Save your progress</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            You're on a guest session — create an account and everything you've logged comes with
            you.
          </p>
          <Button size="xl" className="mt-3 w-full" render={<Link to="/sign-up" />}>
            Create account
          </Button>
        </section>
      )}

      <div className="mt-auto space-y-2">
        <Button size="workout" className="w-full" onClick={() => setShareOpen(true)}>
          <Share2 data-icon="inline-start" />
          Share
        </Button>
        <Button variant="outline" size="xl" className="w-full" render={<Link to="/" />}>
          Done
        </Button>
      </div>

      <ShareSheet
        workoutId={doc.data.id}
        isPrivate={doc.data.visibility === 'private'}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
