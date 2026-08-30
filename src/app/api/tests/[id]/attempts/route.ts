import { and, asc, eq } from 'drizzle-orm';
import { apiStudent } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts, questions, testQuestions, tests } from '@/db/schema';
import { shuffleArray } from '@/lib/shuffle';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiStudent();
  const { id: testId } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test || !test.isPublished) {
    throw new HttpError(404, 'not_found', 'Test not found or is not published yet.');
  }

  const now = new Date();
  if (test.opensAt && new Date(test.opensAt) > now) {
    throw new HttpError(403, 'test_not_open', 'This test has not opened yet.', {
      opensAt: test.opensAt,
    });
  }
  if (test.closesAt && new Date(test.closesAt) < now) {
    throw new HttpError(403, 'test_closed', 'This test is now closed.', {
      closesAt: test.closesAt,
    });
  }

  // Check existing attempts
  const existingAttempts = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.testId, testId), eq(attempts.studentId, session.userId)))
    .orderBy(asc(attempts.attemptNo));

  // If there is already an in_progress attempt
  const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');
  if (activeAttempt) {
    // If deadline has not passed, return this attempt
    if (new Date(activeAttempt.deadlineAt) > now) {
      return json({
        attemptId: activeAttempt.id,
        serverTime: now.toISOString(),
        deadlineAt: activeAttempt.deadlineAt,
        questionOrder: activeAttempt.questionOrder,
        instructions: {
          totalQuestions: activeAttempt.questionOrder.length,
          durationS: test.durationS,
        },
      });
    }
  }

  if (existingAttempts.length >= test.maxAttempts) {
    throw new HttpError(
      403,
      'max_attempts_exceeded',
      `You have already completed all ${test.maxAttempts} allowed attempt(s) for this test.`,
    );
  }

  // Load test questions
  const assigned = await db
    .select({
      questionId: testQuestions.questionId,
      position: testQuestions.position,
      type: questions.type,
      options: questions.options,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(questions.id, testQuestions.questionId))
    .where(eq(testQuestions.testId, testId))
    .orderBy(asc(testQuestions.position));

  if (assigned.length === 0) {
    throw new HttpError(422, 'empty_test', 'Test has no questions assigned.');
  }

  // Materialize question order
  let questionOrder = assigned.map((a) => a.questionId);
  if (test.shuffleQuestions) {
    questionOrder = shuffleArray(questionOrder);
  }

  // Materialize option orders
  const optionOrders: Record<string, string[]> = {};
  if (test.shuffleOptions) {
    for (const q of assigned) {
      if (q.type === 'mcq' && q.options && q.options.length > 0) {
        const keys = q.options.map((o) => o.key);
        optionOrders[q.questionId] = shuffleArray(keys);
      }
    }
  }

  const deadlineAt = new Date(Date.now() + test.durationS * 1000);
  const attemptId = crypto.randomUUID();
  const attemptNo = existingAttempts.length + 1;

  // Insert attempt and pre-insert attempt_answers
  await db.transaction(async (tx) => {
    await tx.insert(attempts).values({
      id: attemptId,
      testId,
      studentId: session.userId,
      attemptNo,
      startedAt: now,
      deadlineAt,
      status: 'in_progress',
      questionOrder,
      optionOrders,
    });

    await tx.insert(attemptAnswers).values(
      assigned.map((q) => ({
        attemptId,
        questionId: q.questionId,
        state: 'not_seen' as const,
        timeSpentMs: 0,
        visitCount: 0,
        response: null,
      })),
    );
  });

  return json(
    {
      attemptId,
      serverTime: now.toISOString(),
      deadlineAt: deadlineAt.toISOString(),
      questionOrder,
      instructions: {
        totalQuestions: assigned.length,
        durationS: test.durationS,
      },
    },
    201,
  );
});
