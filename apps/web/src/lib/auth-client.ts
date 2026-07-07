import { anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Same-origin better-auth client (Vite proxies /api in dev, Caddy in prod) —
 * no CORS/cookie config needed. Version pinned to the server's better-auth
 * (apps/api) so plugin wire formats can't skew.
 */
export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});

export type SessionUser = (typeof authClient.$Infer.Session)['user'];
