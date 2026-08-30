import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { BarChart3, Clock, HelpCircle, Plus, Users } from 'lucide-react';
import { getDb } from '@/db/client';
import { attempts, testQuestions, tests } from '@/db/schema';
import { Badge, buttonClass, Card, CardBody, EmptyState } from '@/components/ui';
import { TeacherTestsClientActions } from './TeacherTestsClientActions';

export default async function TeacherTestsPage() {
  const db = await getDb();

  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      durationS: tests.durationS,
      opensAt: tests.opensAt,
      closesAt: tests.closesAt,
      maxAttempts: tests.maxAttempts,
      shuffleQuestions: tests.shuffleQuestions,
      shuffleOptions: tests.shuffleOptions,
      resultsPolicy: tests.resultsPolicy,
      releasedAt: tests.releasedAt,
      isPublished: tests.isPublished,
      createdAt: tests.createdAt,
      questionCount: sql<number>`cast(count(distinct ${testQuestions.questionId}) as int)`,
      attemptCount: sql<number>`cast(count(distinct ${attempts.id}) as int)`,
    })
    .from(tests)
    .leftJoin(testQuestions, eq(testQuestions.testId, tests.id))
    .leftJoin(attempts, eq(attempts.testId, tests.id))
    .groupBy(tests.id)
    .orderBy(desc(tests.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Tests</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Create, configure, schedule, and publish JEE tests for students.
          </p>
        </div>
        <Link href="/teacher/tests/new" className={buttonClass('primary', 'md')}>
          <Plus className="mr-1.5 size-4" />
          Create Test
        </Link>
      </div>

      {allTests.length === 0 ? (
        <EmptyState
          title="No tests created yet"
          hint="Create your first JEE test and pick verified questions from the question bank."
          action={
            <Link href="/teacher/tests/new" className={buttonClass('primary', 'md')}>
              <Plus className="mr-1.5 size-4" />
              Create First Test
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {allTests.map((t) => (
            <Card key={t.id} className="transition-shadow hover:shadow-sm">
              <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/teacher/tests/${t.id}`}
                      className="font-semibold text-slate-900 hover:text-brand-700 dark:text-slate-100 dark:hover:text-brand-400"
                    >
                      {t.title}
                    </Link>
                    {t.isPublished ? (
                      <Badge tone="green">Published</Badge>
                    ) : (
                      <Badge tone="amber">Draft</Badge>
                    )}
                    <Badge tone="slate">
                      {t.resultsPolicy === 'immediate' ? 'Instant Results' : 'Release Later'}
                    </Badge>
                    {t.releasedAt && <Badge tone="brand">Results Released</Badge>}
                  </div>

                  {t.description && (
                    <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {Math.round(t.durationS / 60)} mins
                    </span>
                    <span className="flex items-center gap-1">
                      <HelpCircle className="size-3.5" />
                      {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" />
                      {t.attemptCount} attempt{t.attemptCount === 1 ? '' : 's'}
                    </span>
                    {t.shuffleQuestions && <span>• Shuffled Qs</span>}
                    {t.shuffleOptions && <span>• Shuffled Options</span>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/teacher/tests/${t.id}`}
                    className={buttonClass('secondary', 'sm')}
                  >
                    Edit / Builder
                  </Link>

                  <Link
                    href={`/teacher/tests/${t.id}/analytics`}
                    className={buttonClass('secondary', 'sm')}
                  >
                    <BarChart3 className="mr-1 size-3.5" />
                    Analytics
                  </Link>

                  <TeacherTestsClientActions
                    testId={t.id}
                    isPublished={t.isPublished}
                    resultsPolicy={t.resultsPolicy}
                    hasReleasedResults={Boolean(t.releasedAt)}
                    attemptCount={t.attemptCount}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
