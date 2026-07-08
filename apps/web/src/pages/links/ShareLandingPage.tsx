import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2Off, Unlink } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/EmptyState';
import { Wordmark } from '@/components/app/Wordmark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { trpcErrorCode, useTRPC } from '@/lib/trpc';

/**
 * The growth loop's front door (FRONTEND.md §3.10): read-only preview, then
 * Clone — creating a silent guest session first if needed. The api's
 * /s/:token OG page bounced the visitor here.
 */
export default function ShareLandingPage() {
  const { token = '' } = useParams<{ token: string }>();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isPending: sessionPending, ensureSession } = useAuthentication();

  const shared = useQuery(trpc.sharing.resolve.queryOptions({ token }));

  const clone = useMutation(
    trpc.workouts.clone.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.workouts.pathKey() });
        toast.success("Workout added — it's ready on Home");
        navigate('/', { replace: true });
      },
      onError: (e) => toast.error(e.message || "Couldn't clone the workout"),
    }),
  );

  // Guest session is created only on this explicit click (never on page load —
  // link prefetchers must not mint sessions).
  const handleClone = async () => {
    await ensureSession();
    clone.mutate({ source: { token } });
  };

  if (shared.isPending) {
    return (
      <div className="mx-auto w-full max-w-md space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (shared.isError) {
    const code = trpcErrorCode(shared.error);
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md items-center px-6">
        <div className="w-full space-y-6">
          <Wordmark />
          <EmptyState
            icon={code === 'FORBIDDEN' ? Link2Off : Unlink}
            title="This link is no longer active"
            description={
              code === 'FORBIDDEN'
                ? 'The owner revoked it. Ask them for a fresh link.'
                : 'It may be mistyped, or the workout is gone.'
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

  const { workout, owner } = shared.data;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-6 py-8">
      <header className="flex items-center justify-between">
        <Wordmark />
        {!sessionPending && !user && (
          <Link to="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        )}
      </header>

      <div className="space-y-2">
        <Badge variant="secondary">Shared workout</Badge>
        <h1 className="text-h1">{workout.name}</h1>
        <p className="text-sm text-secondary">From {owner.name}</p>
        {workout.notes && <p className="text-sm text-muted-foreground">{workout.notes}</p>}
      </div>

      <ul className="divide-y rounded-2xl border bg-card">
        {workout.exercises.map((we) => (
          <li key={we.id} className="px-4 py-3">
            <p className="truncate text-sm font-medium">{we.exercise.name}</p>
            <p className="numeric text-xs text-muted-foreground">
              {we.sets.length} set{we.sets.length === 1 ? '' : 's'}
              {we.superSetId ? ' · superset' : ''}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-auto space-y-2">
        <Button
          size="workout"
          className="w-full"
          disabled={clone.isPending}
          onClick={() => void handleClone()}
        >
          {clone.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Copy data-icon="inline-start" />
          )}
          Clone this workout
        </Button>
        <p className="text-center text-xs text-faint">
          No account needed — it lands on your Home, ready to start.
        </p>
      </div>
    </div>
  );
}
