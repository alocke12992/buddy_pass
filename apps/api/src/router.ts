// Public type boundary: apps/web imports ONLY `import type { AppRouter }` from
// this module (package export "./router") — never runtime code.
export { appRouter, type AppRouter } from './trpc/router';
