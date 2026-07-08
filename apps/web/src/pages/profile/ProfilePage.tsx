import type { UnitPreference } from '@buddy-pass/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, LogOut, Plus, Settings as SettingsIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { ErrorCard } from '@/components/app/ErrorCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthentication } from '@/context/Authentication';
import { displayWeight, formatWeight, weightUnitLabel } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { WeighInSheet } from './WeighInSheet';

// recharts stays out of the main bundle
const VolumeChart = lazy(() => import('./VolumeChart'));
const BodyWeightChart = lazy(() => import('./BodyWeightChart'));

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex-1 rounded-xl border bg-card p-3 text-center">
      <div className="numeric text-stat text-primary">{value}</div>
      <div className="text-label mt-0.5 text-faint">{label}</div>
    </div>
  );
}

function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const chartDateLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** You: stats, charts, weigh-ins, settings (FRONTEND.md §3.12). */
export default function ProfilePage() {
  const trpc = useTRPC();
  const { user, signOut } = useAuthentication();
  const [weighInOpen, setWeighInOpen] = useState(false);

  const profile = useQuery(trpc.profile.get.queryOptions());
  const summary = useQuery(trpc.stats.summary.queryOptions({}));
  const volume = useQuery(trpc.stats.volumeOverTime.queryOptions({ bucket: 'week' }));
  const bodyWeight = useQuery(trpc.stats.bodyWeight.queryOptions({}));

  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';

  if (summary.isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-h1">Profile</h1>
        <ErrorCard onRetry={() => void summary.refetch()} />
      </div>
    );
  }

  const volumeData = (volume.data ?? []).map((b) => ({
    label: chartDateLabel(b.bucketStart),
    volume: displayWeight(b.totalVolumeKg, unit),
  }));
  const weightData = (bodyWeight.data ?? []).map((m) => ({
    label: chartDateLabel(m.measuredAt),
    weight: displayWeight(m.weightKg, unit),
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-h1">Profile</h1>

      {/* Header / guest CTA */}
      {user?.isAnonymous ? (
        <section className="rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <p className="font-medium">You're a guest</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create an account to keep your workouts and see them anywhere.
          </p>
          <Button size="xl" className="mt-3 w-full" render={<Link to="/sign-up" />}>
            Create account
          </Button>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
            {(user?.name || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{user?.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </section>
      )}

      {/* Stats block */}
      <div className="flex gap-2">
        <StatTile label="Workouts" value={summary.data?.workoutsCompleted ?? '–'} />
        <StatTile label="This week" value={summary.data?.currentWeekCount ?? '–'} />
        <StatTile
          label="Total volume"
          value={summary.data ? formatWeight(summary.data.totalVolumeKg, unit) : '–'}
        />
      </div>

      {/* Volume over time */}
      <ChartCard title="Volume">
        {volume.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : volumeData.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Log a couple of workouts to see your volume trend.
          </p>
        ) : (
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <VolumeChart data={volumeData} />
          </Suspense>
        )}
      </ChartCard>

      {/* Body weight */}
      <ChartCard
        title="Body weight"
        action={
          <Button size="sm" variant="outline" onClick={() => setWeighInOpen(true)}>
            <Plus data-icon="inline-start" />
            Log weigh-in
          </Button>
        }
      >
        {bodyWeight.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : weightData.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {weightData.length === 1
              ? `Latest: ${weightData[0]!.weight} ${weightUnitLabel(unit)} — log one more to see the trend.`
              : 'Log a weigh-in to start tracking.'}
          </p>
        ) : (
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <BodyWeightChart data={weightData} />
          </Suspense>
        )}
      </ChartCard>

      {/* Links */}
      <div className="space-y-2">
        <Link
          to="/settings"
          className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4 transition-colors hover:bg-accent/40"
        >
          <SettingsIcon aria-hidden className="size-5 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Settings</span>
          <ChevronRight aria-hidden className="size-4 text-faint" />
        </Link>
        <Button variant="outline" size="xl" className="w-full" onClick={() => void signOut()}>
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </div>

      <WeighInSheet open={weighInOpen} onOpenChange={setWeighInOpen} unit={unit} />
    </div>
  );
}
