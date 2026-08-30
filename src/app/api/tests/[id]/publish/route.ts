import { eq, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, questions, testQuestions, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const assigned = await db
    .select({
      position: testQuestions.position,
      questionId: questions.id,
      humanCode: questions.humanCode,
      status: questions.status,
      subject: questions.subject,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(questions.id, testQuestions.questionId))
    .where(eq(testQuestions.testId, id));

  if (assigned.length === 0) {
    throw new HttpError(422, 'publish_gate_failed', 'Cannot publish a test with no questions assigned.');
  }

  const unverified = assigned.filter((q) => q.status !== 'verified');
  if (unverified.length > 0) {
    throw new HttpError(
      422,
      'publish_gate_failed',
      `Cannot publish: ${unverified.length} question(s) are not verified. All questions must be verified before publishing.`,
      {
        unverified: unverified.map((u) => ({
          position: u.position,
          questionId: u.questionId,
          humanCode: u.humanCode,
          status: u.status,
          subject: u.subject,
        })),
      },
    );
  }

  const [updated] = await db.update(tests).set({ isPublished: true }).where(eq(tests.id, id)).returning();

  return json(updated);
});

/**
 * Unpublish — withdraw a test from the student list.
 *
 * The PATCH route has always accepted `isPublished: false`, but nothing in the
 * UI exposed it, so a test published by mistake could not be taken back. Blocked
 * once attempts exist: pulling a test out from under a student mid-paper would
 * break their runner, and hiding a completed test would orphan its scorecards.
 */
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');
  if (!test.isPublished) return json(test);

  const [{ attemptCount }] = await db
    .select({ attemptCount: sql<number>`cast(count(*) as int)` })
    .from(attempts)
    .where(eq(attempts.testId, id));

  if (attemptCount > 0) {
    throw new HttpError(
      409,
      'test_in_use',
      `Cannot unpublish: ${attemptCount} student attempt(s) already exist for this test.`,
      { attemptCount },
    );
  }

  const [updated] = await db.update(tests).set({ isPublished: false }).where(eq(tests.id, id)).returning();
  return json(updated);
});
