import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { getDb, type Db } from '@/db/client';
import { attempts } from '@/db/schema';
import { gradeAndCloseAttempt } from './attempts';

/**
 * LLD §7.1: "Vercel Cron every 5 min auto-submits any in_progress attempt past
 * deadline, so an abandoned tab still gets graded." Locally this runs on a
 * 60s setInterval from client.ts instead of a cron route, plus
 * opportunistically whenever an attempt is read (added in stage 7) — so a
 * server restart can't leave a stale attempt un-swept for a full interval.
 *
 * This DOES grade. It previously only flipped `status` to 'auto_submitted' on
 * the theory that "the actual scoring transaction runs separately" — but
 * nothing ever ran it, and because submit short-circuits on an already-closed
 * attempt, a student who ran out of time was left permanently at 0/0 with
 * every answer discarded. Scoring now goes through the same
 * gradeAndCloseAttempt() the manual submit path uses, so both routes produce
 * an identically-shaped, fully-graded attempt and whichever fires first wins
 * harmlessly.
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

  const expired = await database
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.status, 'in_progress'), lt(attempts.deadlineAt, new Date())));

  if (expired.length === 0) return 0;

  let closed = 0;
  for (const { id } of expired) {
    try {
      await gradeAndCloseAttempt(database, id, 'auto_submitted');
      closed += 1;
    } catch (err) {
      // One bad attempt (a question deleted out from under it, say) must not
      // stop the rest of the sweep.
      console.error(`[sweep] failed to grade attempt ${id}`, err);
    }
  }

  if (closed > 0) {
    console.log(`[sweep] auto-submitted and graded ${closed} expired attempt(s)`);
  }
  return closed;
}

/**
 * One-off repair for attempts already stranded by the pre-fix sweep: closed,
 * but never scored. Exposed as `npm run regrade`.
 */
export async function regradeUngradedAttempts(db?: Db): Promise<number> {
  const database = db ?? (await getDb());

  const stranded = await database
    .select({ id: attempts.id, status: attempts.status })
    .from(attempts)
    .where(
      and(
        or(eq(attempts.status, 'auto_submitted'), eq(attempts.status, 'submitted')),
        isNull(attempts.totalMarks),
      ),
    );

  let fixed = 0;
  for (const row of stranded) {
    try {
      // Keep whichever status it already carries — a stranded manual submit
      // should not be relabelled as an auto-submit.
      await gradeAndCloseAttempt(database, row.id, row.status as 'submitted' | 'auto_submitted');
      fixed += 1;
    } catch (err) {
      console.error(`[regrade] failed for attempt ${row.id}`, err);
    }
  }
  return fixed;
}
