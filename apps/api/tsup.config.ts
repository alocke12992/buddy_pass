import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@buddy-pass\//],
  // pg is CJS with dynamic requires — bundling it into ESM breaks ("Dynamic require
  // of 'events'"). It reaches the runtime via @buddy-pass/db in pnpm deploy's output.
  external: ['pg'],
});
