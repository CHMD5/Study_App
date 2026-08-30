import { notFound } from 'next/navigation';
import { desc, eq, sql } from 'drizzle-orm';
import { requireStudent } from '@/lib/auth';
import { getDb } from '@/db/client';
import { testQuestions, tests } from '@/db/schema';
import { TestInstructionClient } from './TestInstructionClient';

export default async function StudentTestInstructionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireStudent();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      durationS: tests.durationS,
      opensAt: tests.opensAt,
      closesAt: tests.closesAt,
      maxAttempts: tests.maxAttempts,
      isPublished: tests.isPublished,
      questionCount: sql<number>`cast(count(${testQuestions.questionId}) as int)`,
    })
    .from(tests)
    .leftJoin(testQuestions, eq(testQuestions.testId, tests.id))
    .where(eq(tests.id, id))
    .groupBy(tests.id);

  if (!test || !test.isPublished) {
    notFound();
  }

  return <TestInstructionClient test={test} studentName={session.fullName} />;
}
