import { and, eq, inArray } from 'drizzle-orm';
import { apiSession } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts, questions, testQuestions } from '@/db/schema';
import { toStudentQuestion } from '@/lib/dto';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  // apiSession, not requireSession — the latter redirects, which withApi turns
  // into a 500 rather than a 401.
  const session = await apiSession();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!attempt) {
    throw new HttpError(404, 'not_found', 'Attempt not found');
  }

  if (session.role === 'student' && attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot view another student’s attempt.');
  }

  const qIds = attempt.questionOrder;
  if (!qIds || qIds.length === 0) {
    return json([]);
  }

  const rawQuestions = await db
    .select({
      id: questions.id,
      body: questions.body,
      type: questions.type,
      options: questions.options,
      subject: questions.subject,
      chapter: questions.chapter,
      topic: questions.topic,
      marksCorrect: testQuestions.marksCorrect,
      marksWrong: testQuestions.marksWrong,
      marksUnattempted: testQuestions.marksUnattempted,
      position: testQuestions.position,
    })
    .from(questions)
    .innerJoin(
      testQuestions,
      and(eq(testQuestions.questionId, questions.id), eq(testQuestions.testId, attempt.testId)),
    )
    .where(inArray(questions.id, qIds));

  const answers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId));

  const questionsMap = new Map(rawQuestions.map((q) => [q.id, q]));
  const answersMap = new Map(answers.map((a) => [a.questionId, a]));
  const optionOrders = (attempt.optionOrders as Record<string, string[]>) ?? {};

  // Preserve the exact materialized questionOrder
  const result = qIds.map((qid, index) => {
    const rawQ = questionsMap.get(qid);
    if (!rawQ) {
      throw new HttpError(500, 'missing_question', `Question ${qid} not found in database`);
    }

    const marks = {
      correct: Number(rawQ.marksCorrect ?? 4),
      wrong: Number(rawQ.marksWrong ?? -1),
      unattempted: Number(rawQ.marksUnattempted ?? 0),
    };

    const studentQ = toStudentQuestion(rawQ, index + 1, marks, optionOrders[qid]);
    const savedAnswer = answersMap.get(qid);

    return {
      ...studentQ,
      state: savedAnswer?.state ?? 'not_seen',
      response: savedAnswer?.response ?? null,
      timeSpentMs: savedAnswer?.timeSpentMs ?? 0,
      visitCount: savedAnswer?.visitCount ?? 0,
    };
  });

  return json(result);
});
