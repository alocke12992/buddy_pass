import { publicProcedure, router } from './trpc';
import { exercisesRouter } from './routers/exercises';
import { friendsRouter } from './routers/friends';
import { loggingRouter } from './routers/logging';
import { profileRouter } from './routers/profile';
import { sharingRouter } from './routers/sharing';
import { statsRouter } from './routers/stats';
import { workoutsRouter } from './routers/workouts';

export const appRouter = router({
  ping: publicProcedure.query(() => ({ pong: true, at: new Date() })),
  exercises: exercisesRouter,
  workouts: workoutsRouter,
  logging: loggingRouter,
  profile: profileRouter,
  friends: friendsRouter,
  sharing: sharingRouter,
  stats: statsRouter,
});

export type AppRouter = typeof appRouter;
