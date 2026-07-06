import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // testcontainers pulls + starts postgres on first run
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
