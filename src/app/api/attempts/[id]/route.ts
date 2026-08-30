import { and, eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, tests } from '@/db/schema';
import { sweepExpiredAttempts } from '@/lib/sweep';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const db = await getDb();

  // Opportunistic sweep of expired attempts
  await sweepExpiredAttempts(db).catch(() => {});

  const [attempt] = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      studentId: attempts.studentId,
      attemptNo: attempts.attemptNo,
      startedAt: attempts.startedAt,
      deadlineAt: attempts.deadlineAt,
      submittedAt: attempts.submittedAt,
      status: attempts.status,
      questionOrder: attempts.questionOrder,
      totalMarks: attempts.totalMarks,
      maxMarks: attempts.maxMarks,
      totalTimeS: attempts.totalTimeS,
      testTitle: tests.title,
      testDescription: tests.description,
      durationS: tests.durationS,
      resultsPolicy: tests.resultsPolicy,
      releasedAt: tests.releasedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(eq(attempts.id, id));

  if (!attempt) {
    throw new HttpError(404, 'not_found', 'Attempt not found');
  }

  // Auth check: student can only read their own attempt; teacher can read any
  if (session.role === 'student' && attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot view another student’s attempt.');
  }

  return json({
    ...attempt,
    serverTime: new Date().toISOString(),
  });
});
