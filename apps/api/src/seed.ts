import { createDb, seedLibrary } from '@buddy-pass/db';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const dataFile =
  process.env.EXERCISE_DATA_FILE ?? new URL('../data/exercises.json', import.meta.url).pathname;
const { db, pool } = createDb(databaseUrl);

try {
  console.log('library seeded:', await seedLibrary(db, dataFile));
} finally {
  await pool.end();
}
