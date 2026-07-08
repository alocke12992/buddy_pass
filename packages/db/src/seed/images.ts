import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fetches the exercise images referenced by data/exercises.json into a local
// static folder (plans/WEB.md milestone 3). Source is pinned to the same
// commit as the vendored json so paths can never drift. Idempotent: existing
// files are skipped, so re-runs are fast no-ops. This is also the fetch half
// of the future S3 sync (plans/INFRA.md milestone 6).
const SOURCE_COMMIT = '5197c055b356498944328bd00178b64a5e9f422c';
const BASE_URL = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${SOURCE_COMMIT}/exercises`;
const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../data/exercises.json');
/** apps/web/public/exercise-images — gitignored; Vite serves it at /exercise-images. */
const DEFAULT_DEST = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../apps/web/public/exercise-images',
);
const CONCURRENCY = 8;
const MAX_RETRIES = 5;

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function fetchImage(relPath: string, dest: string): Promise<'downloaded' | 'skipped'> {
  const target = join(dest, relPath);
  if (await exists(target)) return 'skipped';

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/${relPath}`);
      if (res.status === 429) {
        // GitHub rate limit (the AGENTS.md raw-content gotcha) — back off hard
        await new Promise((r) => setTimeout(r, 3_000 * attempt));
        throw new Error(`HTTP 429 for ${relPath}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${relPath}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return 'downloaded';
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

export async function syncImages(destDir = DEFAULT_DEST) {
  const dest = resolve(destDir);
  const exercises = JSON.parse(await readFile(DATA_FILE, 'utf8')) as { images: string[] }[];
  const paths = exercises.flatMap((e) => e.images);

  let downloaded = 0;
  let skipped = 0;
  const failures: string[] = [];
  const queue = [...paths];

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (let path = queue.shift(); path !== undefined; path = queue.shift()) {
      try {
        const result = await fetchImage(path, dest);
        if (result === 'downloaded') downloaded++;
        else skipped++;
        const done = downloaded + skipped + failures.length;
        if (done % 200 === 0) console.log(`  ${done}/${paths.length}…`);
      } catch (error) {
        failures.push(path);
        console.error(`  failed: ${path} (${String(error)})`);
      }
    }
  });
  await Promise.all(workers);

  console.log(
    `images: ${downloaded} downloaded, ${skipped} already present, ${failures.length} failed → ${dest}`,
  );
  if (failures.length > 0) {
    throw new Error(`${failures.length} image(s) failed to download — re-run to retry`);
  }
  return { total: paths.length, downloaded, skipped };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncImages(process.argv[2]).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
