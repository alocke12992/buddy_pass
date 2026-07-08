import type { AppRouter } from '@buddy-pass/api/router';
import { createTRPCContext } from '@trpc/tanstack-react-query';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/** tRPC error code off a query/mutation error — FORBIDDEN vs NOT_FOUND get honest copy (ADR-0002). */
export function trpcErrorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null | undefined)?.data?.code;
}
