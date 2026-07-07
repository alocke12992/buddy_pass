import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { FastifyInstance } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import superjson from 'superjson';
import { createDb, migrate, seedLibrary, type Database } from '@buddy-pass/db';
import { buildServer, type BuildServerOptions } from '../server';

const MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db/migrations',
);

export interface TestApp {
  server: FastifyInstance;
  /** Direct handle for row-level assertions (use_count, deleted users, ...). */
  db: Database;
  databaseUrl: string;
  stop: () => Promise<void>;
}

/** Testcontainer Postgres + migrations + exercise library + the real server (plans/API.md §4). */
export async function createTestApp(options: Partial<BuildServerOptions> = {}): Promise<TestApp> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const databaseUrl = container.getConnectionUri();
  const { db, pool } = createDb(databaseUrl);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await seedLibrary(db);

  const server = buildServer({
    logger: false,
    databaseUrl,
    appOrigin: 'http://localhost:5173',
    trpcRateLimit: { max: 100_000, windowMs: 60_000 }, // effectively off unless a test overrides
    ...options,
  });
  await server.ready();

  return {
    server,
    db,
    databaseUrl,
    stop: async () => {
      await server.close();
      await pool.end();
      await container.stop();
    },
  };
}

/** Collapse Set-Cookie headers into a Cookie header for subsequent requests. */
function cookieFrom(res: LightMyRequestResponse) {
  const setCookie = res.headers['set-cookie'];
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

export interface Session {
  cookie: string;
  userId: string;
}

/** Register through the real better-auth HTTP surface. Pass a guest's cookie to trigger the merge. */
export async function signUp(
  server: FastifyInstance,
  opts: { name: string; email: string; password?: string; cookie?: string },
): Promise<Session> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: opts.name, email: opts.email, password: opts.password ?? 'password1234' },
    headers: opts.cookie ? { cookie: opts.cookie } : undefined,
  });
  if (res.statusCode >= 400) throw new Error(`sign-up failed (${res.statusCode}): ${res.body}`);
  return { cookie: cookieFrom(res), userId: res.json().user.id };
}

export async function signInAnonymous(server: FastifyInstance): Promise<Session> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/auth/sign-in/anonymous',
    payload: {},
  });
  if (res.statusCode >= 400) {
    throw new Error(`anonymous sign-in failed (${res.statusCode}): ${res.body}`);
  }
  return { cookie: cookieFrom(res), userId: res.json().user.id };
}

export interface TrpcResponse<T = unknown> {
  status: number;
  data: T;
  errorCode?: string;
}

function parseTrpc(res: LightMyRequestResponse): TrpcResponse {
  const body = res.body ? JSON.parse(res.body) : undefined;
  if (body && 'error' in body) {
    const error = superjson.deserialize(body.error) as { data?: { code?: string } };
    return { status: res.statusCode, data: undefined, errorCode: error.data?.code ?? 'UNKNOWN' };
  }
  const result = body?.result;
  return {
    status: res.statusCode,
    data: result && 'data' in result ? superjson.deserialize(result.data) : undefined,
  };
}

/** GET /trpc/<path> with superjson-encoded input — the full stack, not a hand-built context. */
export async function trpcQuery<T = unknown>(
  server: FastifyInstance,
  path: string,
  input?: unknown,
  cookie?: string,
): Promise<TrpcResponse<T>> {
  const qs =
    input === undefined
      ? ''
      : `?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`;
  const res = await server.inject({
    method: 'GET',
    url: `/trpc/${path}${qs}`,
    headers: cookie ? { cookie } : undefined,
  });
  return parseTrpc(res) as TrpcResponse<T>;
}

export async function trpcMutation<T = unknown>(
  server: FastifyInstance,
  path: string,
  input?: unknown,
  cookie?: string,
): Promise<TrpcResponse<T>> {
  // tRPC requires content-type json on mutations even with an empty body (415 otherwise)
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  const res = await server.inject({
    method: 'POST',
    url: `/trpc/${path}`,
    headers,
    ...(input === undefined ? {} : { payload: JSON.stringify(superjson.serialize(input)) }),
  });
  return parseTrpc(res) as TrpcResponse<T>;
}
