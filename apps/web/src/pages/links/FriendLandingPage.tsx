import { useMutation } from '@tanstack/react-query';
import { Link2Off, UserRoundPlus } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/EmptyState';
import { Wordmark } from '@/components/app/Wordmark';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';

/**
 * The consent moment (FRONTEND.md §3.11) — never auto-accepts, so link
 * prefetchers can't consume the invite. Accepting creates a silent guest
 * session first if needed. (Inviter preview needs a resolve endpoint the
 * api doesn't have yet — generic copy until then.)
 */
export default function FriendLandingPage() {
  const { token = '' } = useParams<{ token: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { user, ensureSession } = useAuthentication();

  const accept = useMutation(
    trpc.friends.acceptLink.mutationOptions({
      onSuccess: (data) => {
        toast.success(`You and ${data.friend.name} are buddies now`);
        navigate('/friends', { replace: true, state: { newFriendId: data.friend.id } });
      },
      onError: (e) => {
        const code = trpcErrorCode(e);
        if (code === 'BAD_REQUEST') toast.error("That's your own invite link");
        else if (code === 'FORBIDDEN') toast.error('This invite link was revoked');
        else if (code === 'NOT_FOUND') toast.error('This invite link does not exist');
        else toast.error(e.message || "Couldn't accept the invite");
      },
    }),
  );

  const handleAccept = async () => {
    await ensureSession();
    accept.mutate({ token });
  };

  const failedCode = accept.isError ? trpcErrorCode(accept.error) : undefined;
  if (failedCode === 'FORBIDDEN' || failedCode === 'NOT_FOUND') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-6">
        <div className="w-full space-y-6">
          <Wordmark />
          <EmptyState
            icon={Link2Off}
            title="This link is no longer active"
            description={
              failedCode === 'FORBIDDEN'
                ? 'The inviter revoked it. Ask them for a fresh one.'
                : 'It may be mistyped — ask your buddy to resend it.'
            }
            action={
              <Button variant="outline" size="lg" render={<Link to="/welcome" />}>
                Check out Buddy Pass
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <Wordmark />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-secondary/15 text-secondary">
          <UserRoundPlus aria-hidden className="size-8" />
        </span>
        <h1 className="text-h1">Add a buddy?</h1>
        <p className="text-sm text-muted-foreground">
          Someone invited you to be workout buddies. Accepting means you'll see each other's
          friends-visible workouts — nothing private, ever.
        </p>
      </div>
      <div className="space-y-2">
        <Button
          size="workout"
          className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
          disabled={accept.isPending}
          onClick={() => void handleAccept()}
        >
          {accept.isPending && <Spinner data-icon="inline-start" />}
          Accept
        </Button>
        <Button
          variant="ghost"
          size="xl"
          className="w-full"
          onClick={() => navigate(user ? '/' : '/welcome')}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}
