import { notFound } from 'next/navigation';
import { and, asc, eq, sql } from 'drizzle-orm';
import { requireStudent } from '@/lib/auth';
import { getDb } from '@/db/client';
import { attempts, questions, testQuestions, tests } from '@/db/schema';
import { TestInstructionClient, type MarkingRule } from './TestInstructionClient';

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

  // The instructions screen used to print a hardcoded +4 / -1 / 0, which is
  // simply wrong for any test with a custom scheme. Read the real marks and
  // collapse them into the distinct rules actually in play.
  const assigned = await db
    .select({
      type: questions.type,
      subject: questions.subject,
      marksCorrect: testQuestions.marksCorrect,
      marksWrong: testQuestions.marksWrong,
      marksUnattempted: testQuestions.marksUnattempted,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(questions.id, testQuestions.questionId))
    .where(eq(testQuestions.testId, id))
    .orderBy(asc(testQuestions.position));

  const ruleMap = new Map<string, MarkingRule>();
  for (const row of assigned) {
    const correct = Number(row.marksCorrect);
    const wrong = Number(row.marksWrong);
    const unattempted = Number(row.marksUnattempted);
    const key = `${correct}|${wrong}|${unattempted}`;

    const existing = ruleMap.get(key);
    if (existing) {
      existing.questionCount += 1;
      if (!existing.types.includes(row.type)) existing.types.push(row.type);
    } else {
      ruleMap.set(key, { types: [row.type], correct, wrong, unattempted, questionCount: 1 });
    }
  }

  const subjectMap = new Map<string, number>();
  for (const row of assigned) {
    subjectMap.set(row.subject, (subjectMap.get(row.subject) ?? 0) + 1);
  }

  const [{ attemptsUsed }] = await db
    .select({ attemptsUsed: sql<number>`cast(count(*) as int)` })
    .from(attempts)
    .where(and(eq(attempts.testId, id), eq(attempts.studentId, session.userId)));

  return (
    <TestInstructionClient
      test={test}
      markingRules={[...ruleMap.values()]}
      subjectCounts={[...subjectMap.entries()].map(([subject, count]) => ({ subject, count }))}
      attemptsUsed={attemptsUsed}
      studentName={session.fullName}
    />
  );
}
