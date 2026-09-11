import { and, eq, inArray, sql } from 'drizzle-orm';
import { apiSession } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts, questions, testQuestions, tests, type QuestionOption } from '@/db/schema';
import { isGradeableResponse } from '@/lib/grading';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  // apiSession, not requireSession — the latter redirects, which withApi turns
  // into a 500 rather than a 401.
  const session = await apiSession();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!attempt) throw new HttpError(404, 'not_found', 'Attempt not found');

  if (session.role === 'student' && attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot view another student’s results.');
  }

  if (attempt.status === 'in_progress') {
    throw new HttpError(400, 'attempt_in_progress', 'This attempt has not been submitted yet.');
  }

  const [test] = await db.select().from(tests).where(eq(tests.id, attempt.testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  // Gated on results_policy for students
  if (session.role === 'student' && test.resultsPolicy === 'on_release' && !test.releasedAt) {
    throw new HttpError(
      403,
      'awaiting_release',
      'The results for this test will be released by your teacher later.',
    );
  }

  // Get rank & percentile from v_test_ranks view
  const rankRows = await db.$client.query<{
    rank: number;
    percentile: number;
  }>(
    'SELECT rank, percentile FROM v_test_ranks WHERE test_id = $1 AND student_id = $2 AND attempt_no = $3',
    [attempt.testId, attempt.studentId, attempt.attemptNo],
  );

  const rankInfo = rankRows.rows[0] ?? { rank: 1, percentile: 100 };

  const [totalParticipantsRow] = await db
    .select({ count: sql<number>`cast(count(distinct ${attempts.studentId}) as int)` })
    .from(attempts)
    .where(and(eq(attempts.testId, attempt.testId), sql`status <> 'in_progress'`));

  const qIds = attempt.questionOrder;
  const optionOrders = (attempt.optionOrders as Record<string, string[]>) ?? {};

  const fullQuestions = await db
    .select({
      id: questions.id,
      humanCode: questions.humanCode,
      body: questions.body,
      type: questions.type,
      options: questions.options,
      answer: questions.answer,
      solution: questions.solution,
      difficulty: questions.difficulty,
      expectedTimeS: questions.expectedTimeS,
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

  const userAnswers = await db
    .select()
    .from(attemptAnswers)
    .where(eq(attemptAnswers.attemptId, attemptId));

  const qMap = new Map(fullQuestions.map((q) => [q.id, q]));
  const ansMap = new Map(userAnswers.map((a) => [a.questionId, a]));

  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;

  const subjectScores: Record<string, { marks: number; maxMarks: number; correct: number; total: number }> = {
    physics: { marks: 0, maxMarks: 0, correct: 0, total: 0 },
    chemistry: { marks: 0, maxMarks: 0, correct: 0, total: 0 },
    maths: { marks: 0, maxMarks: 0, correct: 0, total: 0 },
    biology: { marks: 0, maxMarks: 0, correct: 0, total: 0 },
  };

  const reviewItems = qIds.map((qid, index) => {
    const q = qMap.get(qid);
    const ans = ansMap.get(qid);

    if (!q) {
      throw new HttpError(500, 'missing_question', `Question ${qid} not found`);
    }

    let options = q.options ?? [];
    if (q.type === 'mcq' && optionOrders[qid]) {
      const oMap = new Map(options.map((o) => [o.key, o]));
      const reordered: QuestionOption[] = [];
      for (const k of optionOrders[qid]) {
        const item = oMap.get(k);
        if (item) reordered.push(item);
      }
      for (const item of options) {
        if (!optionOrders[qid].includes(item.key)) reordered.push(item);
      }
      options = reordered;
    }

    const marksAwarded = ans?.marksAwarded ? Number(ans.marksAwarded) : 0;
    const isCorrect = ans?.isCorrect ?? null;
    // Shared with the grader so a non-numeric entry in a numerical box can't be
    // scored as unattempted while being summarised as wrong.
    const isAttempted = isGradeableResponse(q.type, ans?.response);
    const timeSpentMs = ans?.timeSpentMs ?? 0;
    const expectedTimeS = q.expectedTimeS ?? 120;
    const isOvertime = timeSpentMs > expectedTimeS * 1.5 * 1000;

    if (isAttempted && isCorrect === true) correctCount++;
    else if (isAttempted && isCorrect === false) wrongCount++;
    else unattemptedCount++;

    if (subjectScores[q.subject]) {
      subjectScores[q.subject].marks += marksAwarded;
      subjectScores[q.subject].maxMarks += Number(q.marksCorrect ?? 4);
      subjectScores[q.subject].total += 1;
      if (isCorrect) subjectScores[q.subject].correct += 1;
    }

    return {
      id: q.id,
      position: index + 1,
      humanCode: q.humanCode,
      body: q.body,
      type: q.type,
      options,
      answer: q.answer,
      solution: q.solution,
      difficulty: q.difficulty,
      expectedTimeS: q.expectedTimeS,
      subject: q.subject,
      chapter: q.chapter,
      topic: q.topic,
      marks: {
        correct: Number(q.marksCorrect ?? 4),
        wrong: Number(q.marksWrong ?? -1),
        unattempted: Number(q.marksUnattempted ?? 0),
      },
      response: ans?.response ?? null,
      state: ans?.state ?? 'not_seen',
      isCorrect,
      isAttempted,
      marksAwarded,
      timeSpentMs,
      isOvertime,
    };
  });

  const totalQuestions = reviewItems.length;
  const accuracy = correctCount + wrongCount > 0 ? Math.round((correctCount / (correctCount + wrongCount)) * 100) : 0;

  return json({
    attemptId: attempt.id,
    testId: test.id,
    testTitle: test.title,
    attemptNo: attempt.attemptNo,
    status: attempt.status,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    totalTimeS: attempt.totalTimeS ?? 0,
    totalMarks: attempt.totalMarks ? Number(attempt.totalMarks) : 0,
    maxMarks: attempt.maxMarks ? Number(attempt.maxMarks) : 0,
    rank: Number(rankInfo.rank),
    percentile: Number(rankInfo.percentile),
    totalParticipants: totalParticipantsRow?.count ?? 1,
    summary: {
      totalQuestions,
      correctCount,
      wrongCount,
      unattemptedCount,
      accuracy,
      subjectScores,
    },
    questions: reviewItems,
  });
});
