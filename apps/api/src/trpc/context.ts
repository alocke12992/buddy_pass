import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Database } from '@buddy-pass/db';
import type { Auth, SessionData } from '../auth';

export interface ContextDeps {
  db: Database;
  auth: Auth;
  /** Public web origin — base for minted /s/ and /f/ URLs. */
  appOrigin: string;
  /** Fixed-window limiter shared across the server instance; key = ip:path. */
  checkRateLimit: (key: string) => boolean;
}

export function createContextFactory(deps: ContextDeps) {
  return async function createContext({ req }: CreateFastifyContextOptions) {
    const sessionData: SessionData | null = await deps.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    return {
      db: deps.db,
      auth: deps.auth,
      appOrigin: deps.appOrigin,
      session: sessionData?.session ?? null,
      user: sessionData?.user ?? null,
      rateLimitKey: (path: string) => `${req.ip}:${path}`,
      checkRateLimit: deps.checkRateLimit,
    };
  };
}

export type Context = Awaited<ReturnType<ReturnType<typeof createContextFactory>>>;
