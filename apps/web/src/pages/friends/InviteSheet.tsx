import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2Off } from 'lucide-react';
import { useState } from 'react';
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
 * Invite sheet (FRONTEND.md §3.7): mint/reuse the friend link, copy, revoke.
 * Minting is registered-only (ADR-0001) — guests get the signup CTA.
 */
export function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user } = useAuthentication();
  const [link, setLink] = useState<{ token: string; url: string } | null>(null);

  const create = useMutation(
    trpc.friends.createLink.mutationOptions({
      onSuccess: (data) => setLink(data),
      onError: (e) => toast.error(e.message || "Couldn't create the invite link"),
    }),
  );
  const revoke = useMutation(
    trpc.friends.revokeLink.mutationOptions({
      onSuccess: async () => {
        setLink(null);
        await queryClient.invalidateQueries({ queryKey: trpc.friends.pathKey() });
        toast('Invite link revoked — existing buddies keep their access');
      },
      onError: (e) => toast.error(e.message || "Couldn't revoke the link"),
    }),
  );

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    // Idempotent mint on open: reuses the active link if one exists
    if (next && !user?.isAnonymous && !link && !create.isPending) create.mutate();
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    toast.success('Link copied — send it to a buddy');
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>Invite a buddy</SheetTitle>
          <SheetDescription>
            Anyone who opens your link becomes your buddy — you'll see each other's friends-visible
            workouts.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 p-4 pt-0">
          {user?.isAnonymous ? (
            <>
              <p className="text-sm text-muted-foreground">
                Invites need an account, so your buddies always find the same you.
              </p>
              <Button size="xl" className="w-full" render={<Link to="/sign-up" />}>
                Create account
              </Button>
            </>
          ) : create.isPending || !link ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="numeric truncate rounded-lg border bg-input/30 px-3 py-2.5 text-sm text-muted-foreground">
                {link.url}
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
                onClick={() => revoke.mutate({ token: link.token })}
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
