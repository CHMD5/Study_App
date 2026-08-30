import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: testId } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  // Load leaderboard from v_test_ranks view joined with profiles and attempts
  const leaderboardRes = await db.$client.query<{
    student_id: string;
    full_name: string;
    username: string;
    batch: string | null;
    attempt_no: number;
    total_marks: string | number;
    rank: number;
    percentile: number;
    submitted_at: string;
    total_time_s: number | null;
  }>(
    `SELECT
       r.student_id,
       p.full_name,
       p.username,
       p.batch,
       r.attempt_no,
       r.total_marks,
       r.rank,
       r.percentile,
       a.submitted_at,
       a.total_time_s
     FROM v_test_ranks r
     JOIN profiles p ON p.id = r.student_id
     JOIN attempts a ON a.test_id = r.test_id AND a.student_id = r.student_id AND a.attempt_no = r.attempt_no
     WHERE r.test_id = $1
     ORDER BY r.rank ASC, a.submitted_at ASC`,
    [testId],
  );

  const leaderboard = leaderboardRes.rows.map((row) => ({
    studentId: row.student_id,
    fullName: row.full_name,
    username: row.username,
    batch: row.batch ?? 'General',
    attemptNo: Number(row.attempt_no),
    totalMarks: Number(row.total_marks),
    rank: Number(row.rank),
    percentile: Number(row.percentile),
    submittedAt: row.submitted_at,
    timeSpentMin: Math.round((row.total_time_s ?? 0) / 60),
  }));

  // Summary stats
  const scores = leaderboard.map((l) => l.totalMarks).sort((a, b) => a - b);
  const totalAttempts = scores.length;
  const highestMarks = totalAttempts > 0 ? scores[totalAttempts - 1] : 0;
  const lowestMarks = totalAttempts > 0 ? scores[0] : 0;
  const averageMarks = totalAttempts > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / totalAttempts) * 10) / 10 : 0;
  const medianMarks = totalAttempts > 0 ? scores[Math.floor(totalAttempts / 2)] : 0;

  // Distribution buckets (6 ranges)
  const distribution = [
    { range: '< 0', count: scores.filter((s) => s < 0).length },
    { range: '0 - 50', count: scores.filter((s) => s >= 0 && s <= 50).length },
    { range: '51 - 100', count: scores.filter((s) => s > 50 && s <= 100).length },
    { range: '101 - 150', count: scores.filter((s) => s > 100 && s <= 150).length },
    { range: '151 - 200', count: scores.filter((s) => s > 150 && s <= 200).length },
    { range: '200+', count: scores.filter((s) => s > 200).length },
  ];

  // Question stats from v_question_stats view
  const qStatsRes = await db.$client.query<{
    question_id: string;
    subject: string;
    chapter: string | null;
    topic: string | null;
    assigned_difficulty: number | null;
    times_served: number;
    times_attempted: number;
    pct_correct: number | null;
    avg_time_s: number | null;
    expected_time_s: number | null;
  }>(
    `SELECT
       qs.question_id,
       qs.subject,
       qs.chapter,
       qs.topic,
       qs.assigned_difficulty,
       qs.times_served,
       qs.times_attempted,
       qs.pct_correct,
       qs.avg_time_s,
       qs.expected_time_s
     FROM v_question_stats qs
     JOIN test_questions tq ON tq.question_id = qs.question_id
     WHERE tq.test_id = $1
     ORDER BY tq.position ASC`,
    [testId],
  );

  const questionStats = qStatsRes.rows.map((row) => ({
    questionId: row.question_id,
    subject: row.subject,
    chapter: row.chapter ?? 'General',
    topic: row.topic ?? '-',
    difficulty: row.assigned_difficulty ?? 5,
    timesServed: Number(row.times_served),
    timesAttempted: Number(row.times_attempted),
    pctCorrect: row.pct_correct !== null ? Number(row.pct_correct) : 0,
    avgTimeS: row.avg_time_s !== null ? Number(row.avg_time_s) : 0,
    expectedTimeS: row.expected_time_s ?? 120,
  }));

  return json({
    testId: test.id,
    title: test.title,
    durationS: test.durationS,
    resultsPolicy: test.resultsPolicy,
    releasedAt: test.releasedAt,
    isPublished: test.isPublished,
    metrics: {
      totalAttempts,
      highestMarks,
      lowestMarks,
      averageMarks,
      medianMarks,
    },
    distribution,
    leaderboard,
    questionStats,
  });
});
