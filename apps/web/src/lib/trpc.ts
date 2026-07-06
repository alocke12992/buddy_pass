import type { AppRouter } from '@buddy-pass/api/router';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
