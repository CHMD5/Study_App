import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { Award, Clock, Eye, HelpCircle, Play, PlayCircle, Sparkles } from 'lucide-react';
import { getDb } from '@/db/client';
import { attempts, testQuestions, tests } from '@/db/schema';
import { getSession } from '@/lib/session';
import { Badge, buttonClass, Card, CardBody, EmptyState } from '@/components/ui';

export default async function StudentDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const db = await getDb();
  const now = new Date();

  // 1. Fetch published tests with question count
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
      questionCount: sql<number>`cast(count(${testQuestions.questionId}) as int)`,
    })
    .from(tests)
    .leftJoin(testQuestions, eq(testQuestions.testId, tests.id))
    .where(eq(tests.isPublished, true))
    .groupBy(tests.id)
    .orderBy(desc(tests.createdAt));

  // 2. Fetch all attempts by this student
  const studentAttempts = await db
    .select()
    .from(attempts)
    .where(eq(attempts.studentId, session.userId))
    .orderBy(desc(attempts.startedAt));

  // 3. Map tests with student attempt state
  const availableList = publishedTests.map((t) => {
    const attemptsForTest = studentAttempts.filter((a) => a.testId === t.id);
    const activeAttempt = attemptsForTest.find((a) => a.status === 'in_progress');
    const completedCount = attemptsForTest.filter(
      (a) => a.status === 'submitted' || a.status === 'auto_submitted',
    ).length;

    const isOpen = (!t.opensAt || new Date(t.opensAt) <= now) && (!t.closesAt || new Date(t.closesAt) >= now);
    const canAttempt = isOpen && completedCount < t.maxAttempts;

    return {
      ...t,
      isOpen,
      canAttempt,
      activeAttempt,
      completedCount,
      attemptsRemaining: Math.max(0, t.maxAttempts - completedCount),
    };
  });

  // 4. Completed attempts for history review
  const completedList = studentAttempts
    .filter((a) => a.status === 'submitted' || a.status === 'auto_submitted')
    .map((a) => {
      const test = publishedTests.find((t) => t.id === a.testId);
      const resultsAvailable = test?.resultsPolicy === 'immediate' || Boolean(test?.releasedAt);
      return {
        ...a,
        testTitle: test?.title ?? 'JEE Test',
        resultsAvailable,
      };
    });

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="rounded-xl bg-gradient-to-r from-brand-900 to-brand-700 p-6 text-white shadow-sm dark:from-brand-950 dark:to-brand-800">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-brand-800/80 px-2.5 py-0.5 text-xs font-semibold text-accent-400 dark:bg-brand-900/90">
              <Sparkles className="mr-1 size-3" />
              JEE Main Preparation
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
              Welcome back, {session.fullName}!
            </h1>
            <p className="mt-0.5 text-xs text-brand-100 dark:text-brand-200">
              Timed CBT tests, instant evaluation, and in-depth performance analytics.
            </p>
          </div>

          <Link href="/student/analytics" className={buttonClass('accent', 'md')}>
            <Award className="mr-1.5 size-4" />
            View My Analytics
          </Link>
        </div>
      </div>

      {/* Available Tests */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Available Tests</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">{availableList.length} total</span>
        </div>

        {availableList.length === 0 ? (
          <EmptyState
            title="No tests published yet"
            hint="Check back soon! Your teacher will publish practice and mock tests here."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {availableList.map((t) => (
              <Card key={t.id} className="transition-all hover:border-brand-300 hover:shadow-sm dark:hover:border-brand-700">
                <CardBody className="flex h-full flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{t.title}</h3>
                      {t.activeAttempt ? (
                        <Badge tone="amber">In Progress</Badge>
                      ) : t.isOpen ? (
                        <Badge tone="green">Open</Badge>
                      ) : (
                        <Badge tone="slate">Closed</Badge>
                      )}
                    </div>

                    {t.description && (
                      <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {Math.round(t.durationS / 60)} mins
                      </span>
                      <span className="flex items-center gap-1">
                        <HelpCircle className="size-3.5" />
                        {t.questionCount} Questions
                      </span>
                      <span>
                        Attempts Left: <strong>{t.attemptsRemaining}</strong> / {t.maxAttempts}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                    {t.activeAttempt ? (
                      <Link
                        href={`/student/attempts/${t.activeAttempt.id}`}
                        className={buttonClass('accent', 'md', 'w-full')}
                      >
                        <Play className="mr-1.5 size-4" />
                        Resume Test
                      </Link>
                    ) : t.canAttempt ? (
                      <Link
                        href={`/student/tests/${t.id}`}
                        className={buttonClass('primary', 'md', 'w-full')}
                      >
                        <PlayCircle className="mr-1.5 size-4" />
                        Take Test
                      </Link>
                    ) : (
                      <button
                        disabled
                        className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-md bg-slate-100 py-2 text-xs font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                      >
                        {t.attemptsRemaining === 0 ? 'All Attempts Completed' : 'Window Closed'}
                      </button>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Tests History */}
      {completedList.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Completed Attempts</h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Test Name</th>
                    <th className="px-4 py-3 font-semibold">Attempt</th>
                    <th className="px-4 py-3 font-semibold">Score</th>
                    <th className="px-4 py-3 font-semibold">Time Spent</th>
                    <th className="px-4 py-3 font-semibold">Submitted On</th>
                    <th className="px-4 py-3 text-right font-semibold">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {completedList.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{a.testTitle}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Attempt #{a.attemptNo}</td>
                      <td className="px-4 py-3 font-bold text-brand-700 dark:text-brand-400">
                        {a.totalMarks ? Number(a.totalMarks) : 0} / {a.maxMarks ? Number(a.maxMarks) : 0}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {Math.round((a.totalTimeS ?? 0) / 60)} mins
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                        {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.resultsAvailable ? (
                          <Link
                            href={`/student/attempts/${a.id}/result`}
                            className={buttonClass('secondary', 'sm')}
                          >
                            <Eye className="mr-1 size-3" />
                            Solutions
                          </Link>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic dark:text-slate-500">Results Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
