/**
 * Wipes data/ back to nothing and re-seeds from scratch (LLD-local plan §8).
 * The fast way to get back to a known-good state after breaking something
 * while poking around.
 *
 * Usage: `npm run reset [-- --yes]`
 *
 * ⚠️ Stop the dev server before running this — it deletes the directory
 * PGlite has locked open.
 */
import fs from 'node:fs';
import readline from 'node:readline/promises';
import { execSync } from 'node:child_process';
import { DATA_DIR } from '../src/lib/paths';

async function main() {
  const skipConfirm = process.argv.includes('--yes') || process.argv.includes('-y');

  if (!skipConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This DELETES everything under ${DATA_DIR} (database, papers, images, backups) and re-seeds ` +
        `from scratch. Make sure no dev server is running first. Type "yes" to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('[reset] cancelled.');
      return;
    }
  }

  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('[reset] data/ removed. Re-seeding...');

  execSync('npm run seed', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error('[reset] failed:', err);
  process.exitCode = 1;
});
