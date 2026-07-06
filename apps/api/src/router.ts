import { publicProcedure, router } from './trpc';

export const appRouter = router({
  ping: publicProcedure.query(() => ({ pong: true, at: new Date() })),
});

export type AppRouter = typeof appRouter;
