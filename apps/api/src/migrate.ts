// One-off migration entrypoint for the prod image (plans/INFRA.md §3):
// deploy.sh runs `docker compose run --rm api node dist/migrate.js` before
// `up -d`, so the migrations that run are version-locked to the image they
// ship in. The drizzle journal makes re-runs no-ops.
import { createDb, migrate } from '@buddy-pass/db';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

// In the image: dist/migrate.js -> /app/migrations (copied from packages/db).
// Locally: override with MIGRATIONS_DIR=../../packages/db/migrations.
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? new URL('../migrations', import.meta.url).pathname;

const { db, pool } = createDb(databaseUrl);
await migrate(db, { migrationsFolder });
await pool.end();
console.log('migrations applied');
