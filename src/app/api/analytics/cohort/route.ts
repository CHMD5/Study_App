import { eq, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, profiles, tests } from '@/db/schema';

export const GET = withApi(async () => {
  await apiTeacher();
  const db = await getDb();

  const [studentCount] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(profiles)
    .where(eq(profiles.role, 'student'));

  const [testCount] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(tests)
    .where(eq(tests.isPublished, true));

  const [attemptCount] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(attempts)
    .where(sql`status <> 'in_progress'`);

  // Class-wide weak chapters
  const chapterStatsRes = await db.$client.query<{
    subject: string;
    chapter: string | null;
    total_answers: number;
    correct_answers: number;
    accuracy_pct: number;
  }>(
    `SELECT
       q.subject,
       COALESCE(q.chapter, 'General') as chapter,
       count(aa.question_id) as total_answers,
       count(aa.question_id) FILTER (WHERE aa.is_correct = true) as correct_answers,
       ROUND((count(aa.question_id) FILTER (WHERE aa.is_correct = true)::numeric / NULLIF(count(aa.question_id) FILTER (WHERE aa.response IS NOT NULL), 0)) * 100, 1) as accuracy_pct
     FROM attempt_answers aa
     JOIN attempts a ON a.id = aa.attempt_id
     JOIN questions q ON q.id = aa.question_id
     WHERE a.status <> 'in_progress' AND aa.response IS NOT NULL
     GROUP BY q.subject, COALESCE(q.chapter, 'General')
     HAVING count(aa.question_id) >= 2
     ORDER BY accuracy_pct ASC, total_answers DESC
     LIMIT 10`,
  );

  const weakChapters = chapterStatsRes.rows.map((r) => ({
    subject: r.subject,
    chapter: r.chapter ?? 'General',
    totalAnswers: Number(r.total_answers),
    correctAnswers: Number(r.correct_answers),
    accuracyPct: r.accuracy_pct !== null ? Number(r.accuracy_pct) : 0,
  }));

  // Overall student rankings across all completed tests
  const studentRankingsRes = await db.$client.query<{
    student_id: string;
    full_name: string;
    username: string;
    batch: string | null;
    tests_taken: number;
    avg_score: number;
    avg_percentile: number;
  }>(
    `SELECT
       p.id as student_id,
       p.full_name,
       p.username,
       p.batch,
       count(a.id) as tests_taken,
       ROUND(avg(a.total_marks)::numeric, 1) as avg_score,
       ROUND(avg(r.percentile)::numeric, 1) as avg_percentile
     FROM profiles p
     JOIN attempts a ON a.student_id = p.id AND a.status <> 'in_progress'
     LEFT JOIN v_test_ranks r ON r.test_id = a.test_id AND r.student_id = a.student_id AND r.attempt_no = a.attempt_no
     WHERE p.role = 'student'
     GROUP BY p.id, p.full_name, p.username, p.batch
     ORDER BY avg_score DESC
     LIMIT 25`,
  );

  const studentRankings = studentRankingsRes.rows.map((r) => ({
    studentId: r.student_id,
    fullName: r.full_name,
    username: r.username,
    batch: r.batch ?? 'General',
    testsTaken: Number(r.tests_taken),
    avgScore: Number(r.avg_score),
    avgPercentile: r.avg_percentile !== null ? Number(r.avg_percentile) : 100,
  }));

  return json({
    metrics: {
      totalStudents: studentCount?.count ?? 0,
      totalPublishedTests: testCount?.count ?? 0,
      totalAttemptsSubmitted: attemptCount?.count ?? 0,
    },
    weakChapters,
    studentRankings,
  });
});
