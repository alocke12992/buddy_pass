import { createContext, useContext } from 'react';
import type { SessionUser } from '@/lib/auth-client';

export interface AuthenticationContextValue {
  /** null while signed out. Guests are real users with isAnonymous=true. */
  user: SessionUser | null;
  /** true until the initial session fetch resolves — gate redirects on it. */
  isPending: boolean;
  signOut: () => Promise<void>;
  /**
   * Silent anonymous session for the /share and /friend landings
   * (FRONTEND.md §3.10–3.11). No-op when any session already exists.
   */
  ensureSession: () => Promise<void>;
}

export const AuthenticationContext = createContext<AuthenticationContextValue | null>(null);

export function useAuthentication(): AuthenticationContextValue {
  const ctx = useContext(AuthenticationContext);
  if (!ctx) throw new Error('useAuthentication must be used within <AuthenticationProvider>');
  return ctx;
}
