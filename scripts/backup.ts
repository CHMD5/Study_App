/**
 * Local substitute for `pg_dump` + Drive (LLD-local plan §8). Snapshots the
 * whole app: the database (via PGlite's own dumpDataDir, a consistent tarball
 * taken through the live connection — no need to stop anything), the uploaded
 * paper PDFs, and the cropped question images, into one timestamped folder
 * under data/backups/. Prunes to the 30 most recent.
 *
 * Safe to run while the dev server is up — dumpDataDir() reads through the
 * same connection the server holds, so it always sees a consistent snapshot
 * rather than a half-written one.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { closeDb, getPg } from '../src/db/client';
import { BACKUPS_DIR, IMAGES_DIR, PAPERS_DIR, ensureDataDirs } from '../src/lib/paths';

const MAX_BACKUPS = 30;

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function main() {
  ensureDataDirs();
  const pg = await getPg();

  const dir = path.join(BACKUPS_DIR, timestamp());
  await fsp.mkdir(dir, { recursive: true });

  const tar = await pg.dumpDataDir('gzip');
  await fsp.writeFile(path.join(dir, 'pgdata.tar.gz'), Buffer.from(await tar.arrayBuffer()));

  if (fs.existsSync(PAPERS_DIR)) await fsp.cp(PAPERS_DIR, path.join(dir, 'papers'), { recursive: true });
  if (fs.existsSync(IMAGES_DIR)) await fsp.cp(IMAGES_DIR, path.join(dir, 'images'), { recursive: true });

  console.log(`[backup] wrote ${dir}`);
  await pruneOldBackups();
}

async function pruneOldBackups(): Promise<void> {
  const entries = (await fsp.readdir(BACKUPS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // timestamp-named, so lexical sort is chronological

  const excess = entries.length - MAX_BACKUPS;
  if (excess <= 0) return;

  for (const name of entries.slice(0, excess)) {
    await fsp.rm(path.join(BACKUPS_DIR, name), { recursive: true, force: true });
    console.log(`[backup] pruned old backup ${name}`);
  }
}

main()
  .catch((err) => {
    console.error('[backup] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
