import { describe, expect, it } from 'vitest';
import { buildServer } from './server';

describe('server', () => {
  it('responds to health check', async () => {
    const server = buildServer({ logger: false });
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await server.close();
  });

  it('serves the trpc ping procedure', async () => {
    const server = buildServer({ logger: false });
    const res = await server.inject({ method: 'GET', url: '/trpc/ping' });
    expect(res.statusCode).toBe(200);
    await server.close();
  });
});
