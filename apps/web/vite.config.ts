import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // Mirror the prod Caddyfile's api surface (/trpc/* /api/* /s/* /f/* /health)
    // so minted short links bounce through the api's OG page in dev too.
    // Keys are raw prefixes: they MUST be slash-terminated ('/s/' not '/s'),
    // otherwise /src/* modules and /favicon.svg get proxied to Fastify.
    proxy: {
      '/trpc': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/s/': 'http://localhost:3000',
      '/f/': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
