import type { UnitPreference } from '@buddy-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, UserRoundX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorCard } from '@/components/app/ErrorCard';
import { FriendAvatar } from '@/components/app/FriendAvatar';
import { StatusBadge } from '@/components/app/StatusBadge';
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
import { formatScheduleDate, formatWeight } from '@/lib/format';
import { useTRPC } from '@/lib/trpc';
import { sortedWithAccents } from './accents';

/**
 * A buddy's page (FRONTEND.md §3.8): friends-visible workouts + stats computed
 * only from those (privacy enforced server-side, API.md §2.7).
 */
export default function FriendProfilePage() {
  const { id = '' } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [removeOpen, setRemoveOpen] = useState(false);

  const friends = useQuery(trpc.friends.list.queryOptions());
  const workouts = useQuery(trpc.workouts.list.queryOptions({ ownerId: id, limit: 50 }));
  const stats = useQuery(trpc.stats.summary.queryOptions({ userId: id }));
  const profile = useQuery(trpc.profile.get.queryOptions());
  const unit: UnitPreference = profile.data?.settings?.unitPreference ?? 'metric';

  const remove = useMutation(
    trpc.friends.remove.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.friends.pathKey() });
        toast('Buddy removed');
        navigate('/friends', { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't remove this buddy"),
    }),
  );

  if (friends.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (friends.isError) {
    return <ErrorCard onRetry={() => void friends.refetch()} />;
  }

  const friend = sortedWithAccents(friends.data).find((f) => f.id === id);
  if (!friend) {
    return (
      <div className="space-y-4">
        <p className="py-12 text-center text-sm text-muted-foreground">
          You're not buddies with this user (or they removed you).
        </p>
        <Button
          variant="outline"
          size="lg"
          className="mx-auto flex"
          render={<Link to="/friends" />}
        >
          Back to friends
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label="Back to friends"
          onClick={() => navigate('/friends')}
        >
          <ChevronLeft />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={`Remove ${friend.name}`}
          onClick={() => setRemoveOpen(true)}
        >
          <UserRoundX className="text-muted-foreground" />
        </Button>
      </header>

      <div className="flex items-center gap-4">
        <FriendAvatar name={friend.name} accent={friend.accent} className="size-16 text-2xl" />
        <div className="min-w-0">
          <h1 className="text-h1 truncate">{friend.name}</h1>
          <p className="text-sm text-secondary">
            Buddies since {formatScheduleDate(friend.friendsSince)}
          </p>
        </div>
      </div>

      {/* Stats from friends-visible workouts only */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border bg-card p-3 text-center">
          <div className="numeric text-stat" style={{ color: friend.accent }}>
            {stats.data?.workoutsCompleted ?? '–'}
          </div>
          <div className="text-label mt-0.5 text-faint">Workouts</div>
        </div>
        <div className="flex-1 rounded-xl border bg-card p-3 text-center">
          <div className="numeric text-stat" style={{ color: friend.accent }}>
            {stats.data ? formatWeight(stats.data.totalVolumeKg, unit) : '–'}
          </div>
          <div className="text-label mt-0.5 text-faint">Volume</div>
        </div>
        <div className="flex-1 rounded-xl border bg-card p-3 text-center">
          <div className="numeric text-stat" style={{ color: friend.accent }}>
            {stats.data?.currentWeekCount ?? '–'}
          </div>
          <div className="text-label mt-0.5 text-faint">This week</div>
        </div>
      </div>

      {/* Their friends-visible workouts */}
      <section className="space-y-2">
        <h2 className="text-h2">Workouts</h2>
        {workouts.isPending ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : workouts.isError ? (
          <ErrorCard onRetry={() => void workouts.refetch()} />
        ) : workouts.data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No friends-visible workouts yet.
          </p>
        ) : (
          workouts.data.items.map((w) => (
            <Link
              key={w.id}
              to={`/workout/${w.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{w.name}</p>
                <p className="numeric truncate text-sm text-muted-foreground">
                  {w.exerciseCount} exercise{w.exerciseCount === 1 ? '' : 's'} · {w.setCount} set
                  {w.setCount === 1 ? '' : 's'}
                </p>
              </div>
              <StatusBadge status={w.status} />
            </Link>
          ))
        )}
      </section>

      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {friend.name}?</DialogTitle>
            <DialogDescription>
              You'll stop seeing each other's friends-visible workouts. A new invite link can always
              bring them back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setRemoveOpen(false)}>
              Keep buddy
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ friendId: friend.id })}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
