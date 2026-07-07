import type { FastifyInstance } from 'fastify';
import type { Database } from '@buddy-pass/db';
import { resolveShareToken } from '../services/sharing';

const escapeHtml = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function ogPage(opts: { title: string; description: string; redirectTo: string }) {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  const redirect = escapeHtml(opts.redirectTo);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:type" content="website" />
<meta name="description" content="${description}" />
<meta http-equiv="refresh" content="0;url=${redirect}" />
</head>
<body>
<p>${description}</p>
<script>location.replace(${JSON.stringify(opts.redirectTo)});</script>
</body>
</html>`;
}

const LINK_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

/**
 * Plain HTTP surface (plans/API.md §3): crawler-visible share pages and friend-link
 * landings. Both bootstrap the SPA (/share/:token, /friend/:token) for humans;
 * Caddy routes /s/* and /f/* here in prod so the SPA owns different paths.
 */
export function registerHttpRoutes(server: FastifyInstance, deps: { db: Database }) {
  server.get<{ Params: { token: string } }>(
    '/s/:token',
    { config: { rateLimit: LINK_RATE_LIMIT } },
    async (req, reply) => {
      const { token } = req.params;
      const redirectTo = `/share/${encodeURIComponent(token)}`;
      const resolution = await resolveShareToken(deps.db, token);

      const count = resolution.ok ? resolution.workout.exerciseCount : 0;
      const html = resolution.ok
        ? ogPage({
            title: `${resolution.workout.name} — Buddy Pass`,
            description: `${count} exercise${count === 1 ? '' : 's'} · shared by ${resolution.owner.name} on Buddy Pass`,
            redirectTo,
          })
        : ogPage({
            title: 'Workout — Buddy Pass',
            description:
              resolution.reason === 'revoked'
                ? 'This share link was revoked'
                : 'This share link does not exist',
            redirectTo,
          });

      const status = resolution.ok ? 200 : resolution.reason === 'revoked' ? 410 : 404;
      return reply.status(status).type('text/html; charset=utf-8').send(html);
    },
  );

  server.get<{ Params: { token: string } }>(
    '/f/:token',
    { config: { rateLimit: LINK_RATE_LIMIT } },
    async (req, reply) => {
      // Just lands in the SPA, which calls friends.acceptLink once a session exists
      return reply.redirect(`/friend/${encodeURIComponent(req.params.token)}`);
    },
  );
}
