import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { attemptAnswers, attempts, questions, testQuestions, tests, type QuestionAnswer } from '@/db/schema';
import { gradeAttempt, type GradingItem } from './grading';
import { withDbLock } from './db-lock';

export type CloseStatus = 'submitted' | 'auto_submitted';

export type CloseAttemptResult = {
  status: CloseStatus;
  totalMarks: number;
  maxMarks: number;
  totalTimeS: number;
  /** false when the attempt was already graded and this call was a no-op. */
  graded: boolean;
};

/**
 * Grades an attempt and closes it, in one transaction.
 *
 * This is the ONLY place an attempt transitions out of `in_progress`. It used
 * to live inline in POST /api/attempts/:id/submit, and the three other paths
 * that close an attempt — the 60s sweep, the sweep invoked opportunistically on
 * every attempt read, and the past-deadline branch of PATCH .../answers — each
 * flipped `status` to 'auto_submitted' WITHOUT scoring. Because submit then
 * short-circuits on an already-closed attempt, whichever path won the race
 * decided whether the student got a score at all: lose it, and the attempt was
 * stuck at 0/0 with every answer discarded and no way to re-grade.
 *
 * Idempotent by `total_marks IS NULL`, so it is safe for the sweep and a
 * student's own submit to both fire — the loser reads back the winner's result
 * instead of overwriting it.
 */
export async function gradeAndCloseAttempt(
  db: Db,
  attemptId: string,
  status: CloseStatus,
): Promise<CloseAttemptResult> {
  return withDbLock(async () => {
    const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
    if (!attempt) throw new Error(`attempt_not_found: ${attemptId}`);

    // Already graded — report what is stored rather than re-scoring.
    if (attempt.totalMarks !== null && attempt.status !== 'in_progress') {
      return {
        status: attempt.status as CloseStatus,
        totalMarks: Number(attempt.totalMarks),
        maxMarks: Number(attempt.maxMarks ?? 0),
        totalTimeS: attempt.totalTimeS ?? 0,
        graded: false,
      };
    }

    const [test] = await db.select().from(tests).where(eq(tests.id, attempt.testId));
    if (!test) throw new Error(`test_not_found: ${attempt.testId}`);

    const userAnswers = await db.select().from(attemptAnswers).where(eq(attemptAnswers.attemptId, attemptId));

    const qIds = userAnswers.map((ua) => ua.questionId);
    const questionRows =
      qIds.length > 0
        ? await db
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
            .where(inArray(questions.id, qIds))
        : [];

    const qMap = new Map(questionRows.map((q) => [q.id, q]));

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

    // An auto-submit can land well after the deadline (the sweep runs on a 60s
    // tick), so elapsed time is measured to the deadline, not to now — a
    // student whose tab died at minute 3 of a 180-minute paper should not be
    // recorded as having spent 180 minutes on it.
    const now = new Date();
    const closedAt = status === 'auto_submitted' ? new Date(attempt.deadlineAt) : now;
    const effectiveEnd = Math.min(closedAt.getTime(), now.getTime());
    const elapsedSec = Math.max(0, Math.round((effectiveEnd - new Date(attempt.startedAt).getTime()) / 1000));
    const totalTimeS = Math.min(test.durationS, Math.max(Math.round(totalSpentMs / 1000), elapsedSec));

    await db.transaction(async (tx) => {
      for (const item of gradeResult.items) {
        await tx
          .update(attemptAnswers)
          .set({ isCorrect: item.isCorrect, marksAwarded: String(item.marksAwarded), updatedAt: now })
          .where(and(eq(attemptAnswers.attemptId, attemptId), eq(attemptAnswers.questionId, item.questionId)));
      }

      await tx
        .update(attempts)
        .set({
          status,
          submittedAt: attempt.submittedAt ?? closedAt,
          totalMarks: String(gradeResult.totalMarks),
          maxMarks: String(gradeResult.maxMarks),
          totalTimeS,
        })
        .where(eq(attempts.id, attemptId));
    });

    return {
      status,
      totalMarks: gradeResult.totalMarks,
      maxMarks: gradeResult.maxMarks,
      totalTimeS,
      graded: true,
    };
  });
}
