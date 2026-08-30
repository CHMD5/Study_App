import { and, eq, inArray } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts, questions, testQuestions, tests, type QuestionAnswer } from '@/db/schema';
import { gradeAttempt, type GradingItem } from '@/lib/grading';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await requireSession();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!attempt) throw new HttpError(404, 'not_found', 'Attempt not found');

  if (session.role === 'student' && attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot submit another student’s attempt.');
  }

  const [test] = await db.select().from(tests).where(eq(tests.id, attempt.testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  // Idempotency: return existing result if already graded and submitted
  if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') {
    return json({
      ok: true,
      alreadySubmitted: true,
      status: attempt.status,
      totalMarks: attempt.totalMarks ? Number(attempt.totalMarks) : 0,
      maxMarks: attempt.maxMarks ? Number(attempt.maxMarks) : 0,
      totalTimeS: attempt.totalTimeS ?? 0,
      resultsPolicy: test.resultsPolicy,
      resultsAvailable: test.resultsPolicy === 'immediate' || Boolean(test.releasedAt),
    });
  }

  // Load all attempt answers
  const userAnswers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId));

  const qIds = userAnswers.map((ua) => ua.questionId);
  if (qIds.length === 0) {
    throw new HttpError(422, 'empty_attempt', 'No questions found in this attempt.');
  }

  // Load questions (with answer key) and test_questions (with marks)
  const questionRows = await db
    .select({
      id: questions.id,
      type: questions.type,
      answer: questions.answer,
      marksCorrect: testQuestions.marksCorrect,
      marksWrong: testQuestions.marksWrong,
      marksUnattempted: testQuestions.marksUnattempted,
    })
    .from(questions)
    .innerJoin(
      testQuestions,
      and(eq(testQuestions.questionId, questions.id), eq(testQuestions.testId, attempt.testId)),
    )
    .where(inArray(questions.id, qIds));

  const qMap = new Map(questionRows.map((q) => [q.id, q]));

  // Build items for grading
  let totalSpentMs = 0;
  const gradingItems: GradingItem[] = [];

  for (const ans of userAnswers) {
    const q = qMap.get(ans.questionId);
    if (!q) continue;

    totalSpentMs += ans.timeSpentMs ?? 0;

    gradingItems.push({
      questionId: ans.questionId,
      type: q.type,
      answerKey: q.answer as QuestionAnswer | null,
      response: ans.response as { key?: string; value?: number | string } | null,
      marksCorrect: Number(q.marksCorrect ?? 4),
      marksWrong: Number(q.marksWrong ?? -1),
      marksUnattempted: Number(q.marksUnattempted ?? 0),
    });
  }

  const gradeResult = gradeAttempt(gradingItems);

  const now = new Date();
  const elapsedSec = Math.max(0, Math.round((now.getTime() - new Date(attempt.startedAt).getTime()) / 1000));
  const totalTimeS = Math.min(test.durationS, Math.max(Math.round(totalSpentMs / 1000), elapsedSec));

  // Atomic scoring transaction
  await db.transaction(async (tx) => {
    for (const item of gradeResult.items) {
      await tx
        .update(attemptAnswers)
        .set({
          isCorrect: item.isCorrect,
          marksAwarded: String(item.marksAwarded),
          updatedAt: now,
        })
        .where(
          and(
            eq(attemptAnswers.attemptId, attemptId),
            eq(attemptAnswers.questionId, item.questionId),
          ),
        );
    }

    await tx
      .update(attempts)
      .set({
        status: 'submitted',
        submittedAt: now,
        totalMarks: String(gradeResult.totalMarks),
        maxMarks: String(gradeResult.maxMarks),
        totalTimeS,
      })
      .where(eq(attempts.id, attemptId));
  });

  return json({
    ok: true,
    status: 'submitted',
    totalMarks: gradeResult.totalMarks,
    maxMarks: gradeResult.maxMarks,
    totalTimeS,
    resultsPolicy: test.resultsPolicy,
    resultsAvailable: test.resultsPolicy === 'immediate' || Boolean(test.releasedAt),
  });
});
