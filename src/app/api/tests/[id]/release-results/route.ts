import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Stamps `released_at`, unlocking scorecards for a test whose policy is
 * 'on_release'. Idempotent: re-releasing keeps the original timestamp so the
 * audit trail records when students first saw their marks.
 *
 * `?revoke=true` clears the stamp. Releasing used to be a one-way door with no
 * way back from a mistaken click.
 */
export const POST = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const revoke = new URL(req.url).searchParams.get('revoke') === 'true';

  if (revoke) {
    const [reverted] = await db.update(tests).set({ releasedAt: null }).where(eq(tests.id, id)).returning();
    return json(reverted);
  }

  if (test.resultsPolicy !== 'on_release') {
    throw new HttpError(
      422,
      'policy_mismatch',
      'This test already shows results immediately, so there is nothing to release.',
    );
  }

  if (test.releasedAt) {
    return json(test);
  }

  const [updated] = await db
    .update(tests)
    .set({ releasedAt: new Date() })
    .where(eq(tests.id, id))
    .returning();

  return json(updated);
});
