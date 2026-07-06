import cors from '@fastify/cors';
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify';
import Fastify from 'fastify';
import { appRouter, type AppRouter } from './router';
import { createContext } from './trpc';

export interface BuildServerOptions {
  logger?: boolean;
}

export function buildServer({ logger = true }: BuildServerOptions = {}) {
  const server = Fastify({ logger });

  server.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
    } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'],
  });

  server.get('/health', () => ({ status: 'ok' }));

  return server;
}
