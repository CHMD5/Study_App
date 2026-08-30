import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { requireStudent } from '@/lib/auth';
import { getDb } from '@/db/client';
import { attempts, tests } from '@/db/schema';
import { TestRunnerClient } from './TestRunnerClient';

export default async function TestRunnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStudent();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      studentId: attempts.studentId,
      status: attempts.status,
      startedAt: attempts.startedAt,
      deadlineAt: attempts.deadlineAt,
      questionOrder: attempts.questionOrder,
      totalMarks: attempts.totalMarks,
      testTitle: tests.title,
      durationS: tests.durationS,
      resultsPolicy: tests.resultsPolicy,
      releasedAt: tests.releasedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(eq(attempts.id, attemptId));

  if (!attempt) notFound();

  // Ownership FIRST. This used to run after the redirect below, so Student B
  // opening Student A's submitted-attempt URL was bounced to A's result URL —
  // harmless in the end (that route re-checks), but it leaked the fact that the
  // attempt exists and had been submitted.
  if (attempt.studentId !== session.userId) {
    notFound();
  }

  // If already submitted, redirect to result screen
  if (attempt.status !== 'in_progress') {
    redirect(`/student/attempts/${attemptId}/result`);
  }

  return (
    <TestRunnerClient
      attemptId={attempt.id}
      testTitle={attempt.testTitle}
      deadlineAt={attempt.deadlineAt.toISOString()}
      studentName={session.fullName}
      serverTime={new Date().toISOString()}
    />
  );
}
