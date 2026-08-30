/**
 * One-off repair: grade every attempt that was closed but never scored.
 *
 * Before the sweep was taught to grade, `sweepExpiredAttempts` only flipped
 * `status` to 'auto_submitted'. Because submit short-circuits on an
 * already-closed attempt, any student whose timer ran out — or whose tab was
 * simply idle when the 60s sweep fired — was left at 0/0 with every answer
 * discarded and no path to recovery.
 *
 * Run once after upgrading:  npm run regrade
 */
import { closeDb, getDb } from '../src/db/client';
import { regradeUngradedAttempts } from '../src/lib/sweep';

async function main() {
  const db = await getDb();
  const fixed = await regradeUngradedAttempts(db);

  if (fixed === 0) {
    console.log('[regrade] nothing to do — every closed attempt already has a score.');
  } else {
    console.log(`[regrade] scored ${fixed} previously ungraded attempt(s).`);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error('[regrade] failed', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
