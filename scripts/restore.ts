/**
 * Reverses scripts/backup.ts (LLD-local plan §8): replaces the live database,
 * papers, and images with a backed-up snapshot.
 *
 * Usage: `npm run restore [-- <backup-folder-name>] [-- --yes]`
 * With no folder name, restores the most recent backup.
 *
 * Deliberately does NOT go through src/db/client.ts — that module's getDb()
 * singleton assumes the data directory it opens stays put for the life of the
 * process, which is exactly what this script overwrites. It opens its own
 * throwaway PGlite instance just long enough to materialise the dump to disk,
 * then closes it, so the next real server start picks up the restored files
 * through the normal path.
 *
 * ⚠️ Stop the dev server before running this — PGlite locks its data
 * directory to one process, and this script deletes that directory outright.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { PGlite } from '@electric-sql/pglite';
import { BACKUPS_DIR, IMAGES_DIR, PAPERS_DIR, PGDATA_DIR, ensureDataDirs } from '../src/lib/paths';

async function main() {
  ensureDataDirs();

  const args = process.argv.slice(2);
  const skipConfirm = args.includes('--yes') || args.includes('-y');
  const requestedName = args.find((a) => !a.startsWith('-'));

  const backupName = requestedName ?? (await latestBackup());
  if (!backupName) {
    console.error('[restore] no backups found under data/backups/ — run `npm run backup` first.');
    process.exitCode = 1;
    return;
  }

  const backupDir = path.join(BACKUPS_DIR, backupName);
  const tarPath = path.join(backupDir, 'pgdata.tar.gz');
  if (!fs.existsSync(tarPath)) {
    console.error(`[restore] ${backupDir} has no pgdata.tar.gz — not a valid backup folder.`);
    process.exitCode = 1;
    return;
  }

  if (!skipConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This REPLACES the current database, papers, and images with backup "${backupName}". ` +
        `Make sure no dev server is running first. Type "yes" to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('[restore] cancelled.');
      return;
    }
  }

  console.log(`[restore] restoring from ${backupDir} ...`);

  await fsp.rm(PGDATA_DIR, { recursive: true, force: true });
  const tarBytes = await fsp.readFile(tarPath);
  const pg = await PGlite.create(PGDATA_DIR, { loadDataDir: new Blob([tarBytes]) });
  await pg.close();

  await fsp.rm(PAPERS_DIR, { recursive: true, force: true });
  await fsp.rm(IMAGES_DIR, { recursive: true, force: true });
  const backupPapers = path.join(backupDir, 'papers');
  const backupImages = path.join(backupDir, 'images');
  if (fs.existsSync(backupPapers)) await fsp.cp(backupPapers, PAPERS_DIR, { recursive: true });
  if (fs.existsSync(backupImages)) await fsp.cp(backupImages, IMAGES_DIR, { recursive: true });

  console.log('[restore] done.');
}

async function latestBackup(): Promise<string | undefined> {
  if (!fs.existsSync(BACKUPS_DIR)) return undefined;
  const entries = (await fsp.readdir(BACKUPS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  return entries.at(-1);
}

main().catch((err) => {
  console.error('[restore] failed:', err);
  process.exitCode = 1;
});
