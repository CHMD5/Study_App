import { and, eq, lt } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { attempts } from '@/db/schema';

/**
 * LLD §7.1: "Vercel Cron every 5 min auto-submits any in_progress attempt past
 * deadline, so an abandoned tab still gets graded." Locally this runs on a
 * 60s setInterval from instrumentation.ts instead of a cron route, plus
 * opportunistically whenever an attempt is read (added in stage 7) — so a
 * server restart can't leave a stale attempt un-swept for a full interval.
 *
 * This does NOT grade — grading is stage 8's server-side-only answer-key read
 * (LLD §5.3). This only flips status so the attempt stops accepting answers;
 * the actual scoring transaction runs separately, matching submit's shape.
 *
 * Accepts an optional `db` handle so `client.ts`'s `initialise()` can pass its
 * own locally-constructed instance directly. That's not an optimisation — it's
 * required: `initialise()` awaits this function before its own `getDb()`
 * promise resolves, so falling back to the default `await getDb()` here would
 * re-enter that same still-pending promise and deadlock (a promise awaiting
 * its own resolution never settles — observed directly as a silent hang with
 * no error, since nothing else was left to keep the process alive).
 */
export async function sweepExpiredAttempts(db?: Db): Promise<number> {
  const database = db ?? (await getDb());
  const result = await database
    .update(attempts)
    .set({ status: 'auto_submitted', submittedAt: new Date() })
    .where(and(eq(attempts.status, 'in_progress'), lt(attempts.deadlineAt, new Date())))
    .returning({ id: attempts.id });

  if (result.length > 0) {
    console.log(`[sweep] auto-submitted ${result.length} expired attempt(s)`);
  }
  return result.length;
}
