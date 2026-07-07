import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq, schema, seedDemo } from '@buddy-pass/db';
import {
  createTestApp,
  signIn,
  signUp,
  trpcMutation,
  trpcQuery,
  type TestApp,
} from './test/harness';

// Demo seed is a real dev login + befriendable user (plans/WEB.md milestone 0):
// credential account for demo@buddypass.local and the stable demofriend123 link.

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
  await seedDemo(app.db);
}, 120_000);

afterAll(async () => {
  await app?.stop();
});

describe('demo seed', () => {
  it('signs in as the demo user through the real auth endpoint', async () => {
    const session = await signIn(app.server, {
      email: 'demo@buddypass.local',
      password: 'demo1234',
    });
    const profile = await trpcQuery<{
      user: { name: string; isAnonymous: boolean };
      settings: { unitPreference: string } | null;
    }>(app.server, 'profile.get', undefined, session.cookie);
    expect(profile.status).toBe(200);
    expect(profile.data.user).toMatchObject({ name: 'Demo Buddy', isAnonymous: false });
    expect(profile.data.settings?.unitPreference).toBe('imperial');
  });

  it('lets a fresh user befriend the demo user via the demofriend123 link', async () => {
    const fresh = await signUp(app.server, { name: 'Fresh', email: 'fresh@test.local' });
    const accepted = await trpcMutation<{ friend: { name: string } }>(
      app.server,
      'friends.acceptLink',
      { token: 'demofriend123' },
      fresh.cookie,
    );
    expect(accepted.status).toBe(200);
    expect(accepted.data.friend.name).toBe('Demo Buddy');

    const friends = await trpcQuery<{ name: string }[]>(
      app.server,
      'friends.list',
      undefined,
      fresh.cookie,
    );
    expect(friends.data.map((f) => f.name)).toContain('Demo Buddy');
  });

  it('re-running the seed is a no-op', async () => {
    const before = await app.db.select({ n: count() }).from(schema.user);
    const result = await seedDemo(app.db);
    expect(result.created).toBe(false);
    const after = await app.db.select({ n: count() }).from(schema.user);
    expect(after[0]!.n).toBe(before[0]!.n);
  });

  it('re-running heals a database seeded before the demo login existed', async () => {
    const [demo] = await app.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, 'demo@buddypass.local'));
    await app.db.delete(schema.account).where(eq(schema.account.userId, demo!.id));
    const result = await seedDemo(app.db);
    expect(result.created).toBe(false);

    const session = await signIn(app.server, {
      email: 'demo@buddypass.local',
      password: 'demo1234',
    });
    expect(session.userId).toBeTruthy();
  });
});
