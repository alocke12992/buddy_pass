import { useQuery } from '@tanstack/react-query';
import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { EmptyState } from '@/components/app/EmptyState';
import { ErrorCard } from '@/components/app/ErrorCard';
import { FriendAvatar } from '@/components/app/FriendAvatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { sortedWithAccents } from './accents';
import { InviteSheet } from './InviteSheet';

/**
 * Friends (FRONTEND.md §3.7). The activity feed is deferred post-MVP
 * (MVP.md §1) — buddies' workouts are browsed via their profiles.
 */
export default function FriendsPage() {
  const trpc = useTRPC();
  const location = useLocation();
  const highlightId = (location.state as { newFriendId?: string } | null)?.newFriendId;
  const [inviteOpen, setInviteOpen] = useState(false);

  const friends = useQuery(trpc.friends.list.queryOptions());

  if (friends.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="text-h1">Friends</h1>
        <div className="flex gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="size-14 rounded-full" />
          ))}
        </div>
      </div>
    );
  }
  if (friends.isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-h1">Friends</h1>
        <ErrorCard onRetry={() => void friends.refetch()} />
      </div>
    );
  }

  const list = sortedWithAccents(friends.data);

  return (
    <div className="space-y-5">
      <h1 className="text-h1">Friends</h1>

      {list.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Workouts are better with buddies"
          description="Invite a friend with a link — opening it makes you buddies, no accounts needed up front."
          action={
            <Button
              size="xl"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
              onClick={() => setInviteOpen(true)}
            >
              <Plus data-icon="inline-start" />
              Invite a friend
            </Button>
          }
        />
      ) : (
        <>
          {/* Avatar row */}
          <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none]">
            {list.map((friend) => (
              <Link
                key={friend.id}
                to={`/friends/${friend.id}`}
                className="flex w-16 shrink-0 flex-col items-center gap-1.5"
              >
                <FriendAvatar
                  name={friend.name}
                  accent={friend.accent}
                  className={cn(
                    'size-14',
                    friend.id === highlightId &&
                      'ring-2 ring-secondary ring-offset-2 ring-offset-background motion-safe:animate-pulse',
                  )}
                />
                <span className="w-full truncate text-center text-xs text-muted-foreground">
                  {friend.name}
                </span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-secondary/60 text-secondary">
                <Plus aria-hidden className="size-6" />
              </span>
              <span className="text-xs text-muted-foreground">Invite</span>
            </button>
          </div>

          {/* Feed placeholder: deferred post-MVP (MVP.md §1) */}
          <div className="rounded-2xl border border-dashed px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Tap a buddy to browse their friends-visible workouts and clone one.
            </p>
            <p className="mt-1 text-xs text-faint">Activity feed coming after MVP.</p>
          </div>
        </>
      )}

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}
