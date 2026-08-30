import { and, desc, eq, sql } from 'drizzle-orm';
import { apiStudent } from '@/lib/auth';
import { json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, testQuestions, tests } from '@/db/schema';

export const GET = withApi(async () => {
  const session = await apiStudent();
  const db = await getDb();

  const publishedTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      durationS: tests.durationS,
      opensAt: tests.opensAt,
      closesAt: tests.closesAt,
      maxAttempts: tests.maxAttempts,
      resultsPolicy: tests.resultsPolicy,
      releasedAt: tests.releasedAt,
      isPublished: tests.isPublished,
      createdAt: tests.createdAt,
      questionCount: sql<number>`cast(count(distinct ${testQuestions.questionId}) as int)`,
    })
    .from(tests)
    .leftJoin(testQuestions, eq(testQuestions.testId, tests.id))
    .where(eq(tests.isPublished, true))
    .groupBy(tests.id)
    .orderBy(desc(tests.createdAt));

  const studentAttempts = await db
    .select()
    .from(attempts)
    .where(eq(attempts.studentId, session.userId))
    .orderBy(desc(attempts.startedAt));

  const now = new Date();

  const payload = publishedTests.map((test) => {
    const testAttempts = studentAttempts.filter((a) => a.testId === test.id);
    const activeAttempt = testAttempts.find((a) => a.status === 'in_progress');
    const completedAttempts = testAttempts.filter((a) => a.status !== 'in_progress');

    const isOpen = (!test.opensAt || new Date(test.opensAt) <= now) && (!test.closesAt || new Date(test.closesAt) >= now);
    const hasAttemptsLeft = testAttempts.length < test.maxAttempts;
    const canStart = isOpen && hasAttemptsLeft && !activeAttempt;

    return {
      ...test,
      isOpen,
      attemptsUsed: testAttempts.length,
      maxAttempts: test.maxAttempts,
      canStart,
      activeAttemptId: activeAttempt ? activeAttempt.id : null,
      completedAttempts: completedAttempts.map((a) => ({
        id: a.id,
        attemptNo: a.attemptNo,
        status: a.status,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        totalMarks: a.totalMarks ? Number(a.totalMarks) : null,
        maxMarks: a.maxMarks ? Number(a.maxMarks) : null,
        resultsAvailable: test.resultsPolicy === 'immediate' || Boolean(test.releasedAt),
      })),
    };
  });

  return json(payload);
});
