import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2Off } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { useTRPC } from '@/lib/trpc';

/**
 * Share sheet (FRONTEND.md §3.9): one active link per workout, reused across
 * opens; copy, use count, revoke. Minting is registered-only (ADR-0001).
 */
export function ShareSheet({
  workoutId,
  isPrivate,
  open,
  onOpenChange,
}: {
  workoutId: string;
  /** Show the anyone-with-the-link reminder for private workouts. */
  isPrivate: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user } = useAuthentication();
  const registered = user !== null && !user.isAnonymous;

  const links = useQuery(
    trpc.sharing.listForWorkout.queryOptions({ workoutId }, { enabled: open && registered }),
  );
  const active = links.data?.find((l) => l.revokedAt === null) ?? null;

  const invalidateLinks = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.sharing.listForWorkout.queryKey({ workoutId }),
    });

  const create = useMutation(
    trpc.sharing.create.mutationOptions({
      onSuccess: invalidateLinks,
      onError: (e) => toast.error(e.message || "Couldn't create the share link"),
    }),
  );
  const revoke = useMutation(
    trpc.sharing.revoke.mutationOptions({
      onSuccess: async () => {
        await invalidateLinks();
        toast('Link revoked — sharing again will mint a fresh one');
      },
      onError: (e) => toast.error(e.message || "Couldn't revoke the link"),
    }),
  );

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (next && registered) create.mutate({ workoutId }); // idempotent: returns the active link
  };

  const copy = async () => {
    if (!active) return;
    await navigator.clipboard.writeText(active.url);
    toast.success('Link copied');
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Share workout</SheetTitle>
          <SheetDescription>
            {isPrivate
              ? "Anyone with the link can view this workout, even though it's private."
              : 'Anyone with the link can view and clone this workout.'}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          {!registered ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sharing needs an account, so your link keeps working wherever you sign in.
              </p>
              <Button size="xl" className="w-full" render={<Link to="/sign-up" />}>
                Create account
              </Button>
            </>
          ) : !active || create.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="numeric truncate rounded-lg border bg-input/30 px-3 py-2.5 text-sm text-muted-foreground">
                {active.url}
              </p>
              <p className="numeric text-center text-xs text-faint">
                Opened {active.useCount} time{active.useCount === 1 ? '' : 's'}
              </p>
              <Button size="xl" className="w-full" onClick={() => void copy()}>
                <Copy data-icon="inline-start" />
                Copy link
              </Button>
              <Button
                variant="outline"
                size="xl"
                className="w-full"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ token: active.token })}
              >
                <Link2Off data-icon="inline-start" />
                Revoke link
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
