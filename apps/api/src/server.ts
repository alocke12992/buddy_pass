import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import { fromNodeHeaders } from 'better-auth/node';
import Fastify from 'fastify';
import { createDb } from '@buddy-pass/db';
import { createAuth } from './auth';
import { registerHttpRoutes } from './http/routes';
import { createContextFactory } from './trpc/context';
import { appRouter, type AppRouter } from './trpc/router';

export interface BuildServerOptions {
  logger?: boolean;
  /** Defaults to DATABASE_URL (compose postgres in dev). */
  databaseUrl?: string;
  authSecret?: string;
  /** Public URL better-auth treats as its own origin (BETTER_AUTH_URL). */
  authBaseURL?: string;
  /** Public web origin — CSRF trusted origin + base for minted /s/ and /f/ URLs (APP_ORIGIN). */
  appOrigin?: string;
  /** Fixed-window limit for the token-guessing tRPC procedures. */
  trpcRateLimit?: { max: number; windowMs: number };
}

const DEV_SECRET = 'buddy-pass-dev-secret-do-not-use-in-production';

/** Per-server fixed-window limiter (keys = ip:path) for rate-limited tRPC procedures. */
function createFixedWindowLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (hits.size > 10_000) hits.clear(); // crude memory bound; entries are 1-minute windows
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

export function buildServer(options: BuildServerOptions = {}) {
  const {
    logger = true,
    databaseUrl = process.env.DATABASE_URL ?? 'postgres://buddy:buddy@localhost:5432/buddy_pass',
    authSecret = process.env.BETTER_AUTH_SECRET ?? DEV_SECRET,
    authBaseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173',
    trpcRateLimit = { max: 30, windowMs: 60_000 },
  } = options;

  const server = Fastify({ logger });

  if (authSecret === DEV_SECRET) {
    server.log.warn('BETTER_AUTH_SECRET is not set — using the dev-only fallback secret');
  }

  const { db, pool } = createDb(databaseUrl);
  const auth = createAuth({
    db,
    baseURL: authBaseURL,
    secret: authSecret,
    trustedOrigins: [...new Set([appOrigin, authBaseURL])],
  });
  server.addHook('onClose', async () => {
    await pool.end();
  });

  server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  // Route-scoped limits only (share/friend landing pages); tRPC + auth have their own
  server.register(rateLimit, { global: false });

  // better-auth catch-all. Encapsulated JSON parser keeps bodies as raw strings so
  // empty POSTs (e.g. /sign-in/anonymous) survive Fastify's strict JSON parsing.
  server.register(async (instance) => {
    instance.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
    instance.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      handler: async (request, reply) => {
        const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
        const body =
          typeof request.body === 'string' && request.body.length > 0 ? request.body : undefined;
        const response = await auth.handler(
          new Request(url, {
            method: request.method,
            headers: fromNodeHeaders(request.headers),
            body,
          }),
        );
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        return reply.send(response.body ? await response.text() : null);
      },
    });
  });

  server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory({
        db,
        auth,
        appOrigin,
        checkRateLimit: createFixedWindowLimiter(trpcRateLimit),
      }),
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  registerHttpRoutes(server, { db });

  server.get('/health', () => ({ status: 'ok' }));

  return server;
}
