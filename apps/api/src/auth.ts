import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { anonymous } from 'better-auth/plugins';
import { v7 as uuidv7 } from 'uuid';
import { schema, type Database } from '@buddy-pass/db';
import { mergeGuestData } from './services/merge';

export interface CreateAuthOptions {
  db: Database;
  /** Public URL better-auth considers its own origin (BETTER_AUTH_URL). */
  baseURL: string;
  secret: string;
  /** Origins allowed by CSRF checks — must include the SPA origin. */
  trustedOrigins: string[];
}

/**
 * better-auth instance: email/password + anonymous guest sessions
 * (plans/MVP.md §2). Tables were pre-created to the v1.6 core shape in Phase 1;
 * UUIDv7 ids are generated app-side to match the rest of the schema.
 */
export function createAuth({ db, baseURL, secret, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    secret,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      anonymous({
        // Fires when a signed-in guest registers; guest row is deleted afterwards.
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await mergeGuestData(db, anonymousUser.user.id, newUser.user.id);
        },
      }),
    ],
    advanced: { database: { generateId: () => uuidv7() } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionData = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
export type SessionUser = SessionData['user'];
