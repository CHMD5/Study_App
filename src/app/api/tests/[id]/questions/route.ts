import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questions, testQuestions, tests } from '@/db/schema';

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

  // Validate that all question IDs actually exist
  if (list.length > 0) {
    const qIds = list.map((q) => q.questionId);
    const existing = await db
      .select({ id: questions.id })
      .from(questions)
      .where(inArray(questions.id, qIds));

    if (existing.length !== qIds.length) {
      const foundSet = new Set(existing.map((e) => e.id));
      const missing = qIds.filter((qid) => !foundSet.has(qid));
      throw new HttpError(422, 'invalid_question_ids', 'Some question IDs do not exist in the database', {
        missing,
      });
    }
  }

  // Atomic replace of test_questions
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

  return json({ ok: true, count: list.length });
});
