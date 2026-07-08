import type { AppRouter } from '@buddy-pass/api/router';
import type { inferRouterOutputs } from '@trpc/server';

/** Output types inferred from the api's router — the only api import is the type. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type WorkoutDoc = RouterOutputs['workouts']['byId'];
export type WorkoutSummary = RouterOutputs['workouts']['list']['items'][number];
export type ExerciseIndexEntry = RouterOutputs['exercises']['list'][number];
export type ExerciseDetail = RouterOutputs['exercises']['byId'];
export type ExerciseFilters = RouterOutputs['exercises']['filters'];
export type Profile = RouterOutputs['profile']['get'];
