import { Navigate, Outlet, useLocation } from 'react-router';
import { Spinner } from '@/components/ui/spinner';
import { useAuthentication } from '@/context/Authentication';
import { Wordmark } from './Wordmark';

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Wordmark className="text-2xl" />
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

/**
 * Session-gated layout routes (FRONTEND.md §2):
 * - `required`: everything tabbed + workout flows — signed-out visitors land on /welcome.
 *   Guests (anonymous sessions) pass: they see all four tabs, no restrictions.
 * - `signed-out`: welcome / sign-in / sign-up — registered users bounce to Home,
 *   but guests may visit (their upgrade and sign-in path).
 */
export function AuthGate({ mode }: { mode: 'required' | 'signed-out' }) {
  const { user, isPending } = useAuthentication();
  const location = useLocation();

  if (isPending) return <Splash />;
  if (mode === 'required' && !user) {
    return <Navigate to="/welcome" replace state={{ from: location }} />;
  }
  if (mode === 'signed-out' && user && !user.isAnonymous) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
