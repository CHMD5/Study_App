import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, questions, testQuestions, tests } from '@/db/schema';
import { withDbLock } from '@/lib/db-lock';

type Ctx = { params: Promise<{ id: string }> };

const putQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      questionId: z.string().uuid(),
      position: z.number().int().min(1),
      marksCorrect: z.number().default(4),
      marksWrong: z.number().default(-1),
      marksUnattempted: z.number().default(0),
    }),
  ),
});

export const PUT = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = putQuestionsSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid questions payload', {
      issues: parsed.error.issues,
    });
  }

  const db = await getDb();
  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const list = parsed.data.questions;

  // ---------------------------------------------------------------------
  // Refuse to rewrite the question set of a test students have already sat.
  //
  // attempts.question_order is a materialised snapshot, but the result screen
  // re-joins through test_questions to recover each question's marks — so
  // dropping a row here made every historical attempt's result page throw
  // `missing_question` and 500 forever, with no way back.
  // ---------------------------------------------------------------------
  const [{ attemptCount }] = await db
    .select({ attemptCount: sql<number>`cast(count(*) as int)` })
    .from(attempts)
    .where(eq(attempts.testId, id));

  if (attemptCount > 0) {
    throw new HttpError(
      409,
      'test_in_use',
      `This test already has ${attemptCount} student attempt(s). Its question set is frozen so past results stay readable — duplicate the test to build a revised version.`,
      { attemptCount },
    );
  }

  // Duplicate positions or ids would otherwise surface as a raw unique/PK
  // violation from the insert, i.e. a bare 500.
  const seenIds = new Set<string>();
  const seenPositions = new Set<number>();
  for (const item of list) {
    if (seenIds.has(item.questionId)) {
      throw new HttpError(422, 'duplicate_question', 'The same question appears more than once in this test.', {
        questionId: item.questionId,
      });
    }
    seenIds.add(item.questionId);

    if (seenPositions.has(item.position)) {
      throw new HttpError(422, 'duplicate_position', `Two questions share position ${item.position}.`, {
        position: item.position,
      });
    }
    seenPositions.add(item.position);
  }

  if (list.length > 0) {
    const qIds = list.map((q) => q.questionId);
    const existing = await db
      .select({ id: questions.id, status: questions.status, humanCode: questions.humanCode })
      .from(questions)
      .where(inArray(questions.id, qIds));

    if (existing.length !== qIds.length) {
      const foundSet = new Set(existing.map((e) => e.id));
      const missing = qIds.filter((qid) => !foundSet.has(qid));
      throw new HttpError(422, 'invalid_question_ids', 'Some question IDs do not exist in the database', {
        missing,
      });
    }

    // A published test must stay fully verified. The publish gate only runs at
    // publish time, so without this an unverified question could be slipped
    // into a live test afterwards.
    if (test.isPublished) {
      const unverified = existing.filter((q) => q.status !== 'verified');
      if (unverified.length > 0) {
        throw new HttpError(
          422,
          'unverified_in_published_test',
          `Cannot add ${unverified.length} unverified question(s) to a published test. Verify them first, or unpublish the test.`,
          {
            unverified: unverified.map((u) => ({ questionId: u.id, humanCode: u.humanCode, status: u.status })),
          },
        );
      }
    }
  }

  // Atomic replace of test_questions
  await withDbLock(async () => {
    await db.transaction(async (tx) => {
      await tx.delete(testQuestions).where(eq(testQuestions.testId, id));

      if (list.length > 0) {
        await tx.insert(testQuestions).values(
          list.map((item) => ({
            testId: id,
            questionId: item.questionId,
            position: item.position,
            marksCorrect: String(item.marksCorrect),
            marksWrong: String(item.marksWrong),
            marksUnattempted: String(item.marksUnattempted),
          })),
        );
      }
    });
  });

  return json({ ok: true, count: list.length });
});
