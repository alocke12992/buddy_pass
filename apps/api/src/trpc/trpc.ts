import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;

/** No session required — only `sharing.resolve` (ADR-0001). */
export const publicProcedure = t.procedure;

/** Any session, anonymous guests included: clone, build, log, profile, accept friend links. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session, user: ctx.user } });
});

/** Non-anonymous sessions only — minting share/friend links (ADR-0001). */
export const registeredProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.isAnonymous) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Registered account required' });
  }
  return next();
});

/** Per-IP fixed window on token-guessing surfaces (plans/API.md §1). */
const rateLimitGuard = t.middleware(({ ctx, path, next }) => {
  if (!ctx.checkRateLimit(ctx.rateLimitKey(path))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
  }
  return next();
});

export const publicRateLimitedProcedure = publicProcedure.use(rateLimitGuard);
export const authedRateLimitedProcedure = authedProcedure.use(rateLimitGuard);
