import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { AuthenticationContext } from './context';

/**
 * Session state lives here (Context is for session/UI state only — server
 * state stays in React Query, MVP.md §3). Backed by better-auth's reactive
 * session store, so sign-in/up/out through authClient update it automatically.
 */
export function AuthenticationProvider({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const queryClient = useQueryClient();

  const user = session.data?.user ?? null;
  const userId = user?.id ?? null;

  // A different user means every cached tRPC answer is somebody else's — drop them.
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (session.isPending) return;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }, [session.isPending, userId, queryClient]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const ensureSession = useCallback(async () => {
    const current = await authClient.getSession();
    if (!current.data?.user) await authClient.signIn.anonymous();
  }, []);

  const value = useMemo(
    () => ({ user, isPending: session.isPending, signOut, ensureSession }),
    [user, session.isPending, signOut, ensureSession],
  );

  return <AuthenticationContext.Provider value={value}>{children}</AuthenticationContext.Provider>;
}
