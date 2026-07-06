import { createDb } from '../client';
import { seedDemo } from './demo';
import { seedLibrary } from './library';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://buddy:buddy@localhost:5432/buddy_pass';
const withDemo = process.argv.includes('--demo');

const { db, pool } = createDb(databaseUrl);

try {
  const library = await seedLibrary(db);
  console.log('library seeded:', library);
  if (withDemo) {
    const demo = await seedDemo(db);
    console.log(demo.created ? 'demo data seeded:' : 'demo data already present', demo);
  }
} finally {
  await pool.end();
}
