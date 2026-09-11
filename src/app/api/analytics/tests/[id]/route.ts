import { eq, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import {
  computeDiscriminationIndex,
  computeMedian,
  computeQuartiles,
  computeScoreBuckets,
  filterBestAttempts,
} from '@/lib/analytics-metrics';
import { getDb } from '@/db/client';
import { testQuestions, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: testId } = await params;
  const url = new URL(req.url);
  const bestOnly = url.searchParams.get('bestOnly') !== 'false';

  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  // Compute test maxMarks
  const [maxMarksRes] = await db
    .select({ total: sql<number>`COALESCE(SUM(marks_correct), 0)` })
    .from(testQuestions)
    .where(eq(testQuestions.testId, testId));
  const maxMarks = Number(maxMarksRes?.total ?? 300);

  // Load all evaluated attempts for this test
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

  const rawLeaderboard = leaderboardRes.rows.map((row) => ({
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

  // Apply best-attempt filter if requested
  const leaderboard = bestOnly ? filterBestAttempts(rawLeaderboard) : rawLeaderboard;

  // Re-rank if bestOnly was applied
  if (bestOnly) {
    leaderboard.sort((a, b) => b.totalMarks - a.totalMarks);
    leaderboard.forEach((item, idx) => {
      item.rank = idx + 1;
    });
  }

  // Summary stats & quartiles
  const scores = leaderboard.map((l) => l.totalMarks).sort((a, b) => a - b);
  const totalAttempts = scores.length;
  const highestMarks = totalAttempts > 0 ? scores[totalAttempts - 1] : 0;
  const lowestMarks = totalAttempts > 0 ? scores[0] : 0;
  const averageMarks =
    totalAttempts > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / totalAttempts) * 10) / 10
      : 0;

  const quartiles = computeQuartiles(scores);
  const distribution = computeScoreBuckets(scores, maxMarks);

  // Batch Comparison
  const batchMap = new Map<
    string,
    {
      batch: string;
      students: Set<string>;
      attemptsCount: number;
      scores: number[];
      times: number[];
    }
  >();

  for (const row of leaderboard) {
    const bName = row.batch || 'General';
    if (!batchMap.has(bName)) {
      batchMap.set(bName, {
        batch: bName,
        students: new Set(),
        attemptsCount: 0,
        scores: [],
        times: [],
      });
    }
    const b = batchMap.get(bName)!;
    b.students.add(row.studentId);
    b.attemptsCount++;
    b.scores.push(row.totalMarks);
    b.times.push(row.timeSpentMin);
  }

  const batchComparison = Array.from(batchMap.values())
    .map((b) => ({
      batch: b.batch,
      studentCount: b.students.size,
      attemptCount: b.attemptsCount,
      avgScore: Math.round((b.scores.reduce((sum, s) => sum + s, 0) / b.scores.length) * 10) / 10,
      medianScore: computeMedian(b.scores),
      topScore: Math.max(...b.scores),
      avgTimeMin: Math.round(b.times.reduce((sum, t) => sum + t, 0) / b.times.length),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Top and bottom tertiles for discrimination index
  const tertileSize = Math.max(1, Math.floor(scores.length / 3));
  const topScorerIds = new Set(leaderboard.slice(0, tertileSize).map((l) => l.studentId));
  const bottomScorerIds = new Set(leaderboard.slice(-tertileSize).map((l) => l.studentId));

  // Option distribution (distractor analysis) for questions in this test
  const optionCountsRes = await db.$client.query<{
    question_id: string;
    chosen_key: string;
    count: number;
  }>(
    `SELECT
       aa.question_id,
       COALESCE(aa.response->>'key', 'numerical') as chosen_key,
       COUNT(*)::int as count
     FROM attempt_answers aa
     JOIN attempts a ON a.id = aa.attempt_id
     WHERE a.test_id = $1 AND a.status <> 'in_progress' AND aa.response IS NOT NULL
     GROUP BY aa.question_id, aa.response->>'key'`,
    [testId],
  );

  const optionDistributionMap = new Map<string, Record<string, number>>();
  for (const optRow of optionCountsRes.rows) {
    if (!optionDistributionMap.has(optRow.question_id)) {
      optionDistributionMap.set(optRow.question_id, {});
    }
    optionDistributionMap.get(optRow.question_id)![optRow.chosen_key] = optRow.count;
  }

  // Accuracy per tertile for discrimination index
  const tertileAccuracyRes = await db.$client.query<{
    question_id: string;
    student_id: string;
    is_correct: boolean;
  }>(
    `SELECT
       aa.question_id,
       a.student_id,
       aa.is_correct
     FROM attempt_answers aa
     JOIN attempts a ON a.id = aa.attempt_id
     WHERE a.test_id = $1 AND a.status <> 'in_progress'`,
    [testId],
  );

  const tertileStats = new Map<
    string,
    { topCorrect: number; topTotal: number; bottomCorrect: number; bottomTotal: number }
  >();

  for (const row of tertileAccuracyRes.rows) {
    const qid = row.question_id;
    if (!tertileStats.has(qid)) {
      tertileStats.set(qid, { topCorrect: 0, topTotal: 0, bottomCorrect: 0, bottomTotal: 0 });
    }
    const stat = tertileStats.get(qid)!;
    if (topScorerIds.has(row.student_id)) {
      stat.topTotal++;
      if (row.is_correct) stat.topCorrect++;
    } else if (bottomScorerIds.has(row.student_id)) {
      stat.bottomTotal++;
      if (row.is_correct) stat.bottomCorrect++;
    }
  }

  // Per-test question statistics (SCOPED TO THIS TEST)
  const qStatsRes = await db.$client.query<{
    question_id: string;
    position: number;
    subject: string;
    chapter: string | null;
    topic: string | null;
    type: string;
    difficulty: number | null;
    body: string;
    expected_time_s: number | null;
    times_served: number;
    times_attempted: number;
    pct_correct: number | null;
    avg_time_s: number | null;
  }>(
    `SELECT
       tq.question_id,
       tq.position,
       q.subject,
       COALESCE(q.chapter, 'General') as chapter,
       COALESCE(q.topic, '-') as topic,
       q.type,
       q.difficulty,
       q.body,
       q.expected_time_s,
       COUNT(aa.attempt_id)::int as times_served,
       COUNT(aa.attempt_id) FILTER (WHERE aa.response IS NOT NULL)::int as times_attempted,
       ROUND((COUNT(aa.attempt_id) FILTER (WHERE aa.is_correct = true)::numeric / NULLIF(COUNT(aa.attempt_id) FILTER (WHERE aa.response IS NOT NULL), 0)) * 100, 1) as pct_correct,
       ROUND(AVG(aa.time_spent_ms / 1000)::numeric, 1) as avg_time_s
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     LEFT JOIN attempts a ON a.test_id = tq.test_id AND a.status <> 'in_progress'
     LEFT JOIN attempt_answers aa ON aa.attempt_id = a.id AND aa.question_id = tq.question_id
     WHERE tq.test_id = $1
     GROUP BY tq.question_id, tq.position, q.subject, q.chapter, q.topic, q.type, q.difficulty, q.body, q.expected_time_s
     ORDER BY tq.position ASC`,
    [testId],
  );

  const questionStats = qStatsRes.rows.map((row) => {
    const qid = row.question_id;
    const tStat = tertileStats.get(qid);
    const di = tStat
      ? computeDiscriminationIndex(
          tStat.topCorrect,
          tStat.topTotal,
          tStat.bottomCorrect,
          tStat.bottomTotal,
        )
      : null;

    return {
      questionId: qid,
      position: row.position,
      subject: row.subject,
      chapter: row.chapter,
      topic: row.topic,
      type: row.type,
      difficulty: row.difficulty ?? 5,
      bodyPreview: row.body.slice(0, 100),
      timesServed: Number(row.times_served),
      timesAttempted: Number(row.times_attempted),
      pctCorrect: row.pct_correct !== null ? Number(row.pct_correct) : 0,
      avgTimeS: row.avg_time_s !== null ? Number(row.avg_time_s) : 0,
      expectedTimeS: row.expected_time_s ?? 120,
      discriminationIndex: di,
      isLowSample: Number(row.times_attempted) < 5,
      optionBreakdown: optionDistributionMap.get(qid) ?? {},
    };
  });

  return json({
    testId: test.id,
    title: test.title,
    durationS: test.durationS,
    maxMarks,
    resultsPolicy: test.resultsPolicy,
    releasedAt: test.releasedAt,
    isPublished: test.isPublished,
    bestOnly,
    metrics: {
      totalAttempts,
      highestMarks,
      lowestMarks,
      averageMarks,
      medianMarks: quartiles.median,
      p25: quartiles.p25,
      p75: quartiles.p75,
      iqr: quartiles.iqr,
    },
    distribution,
    batchComparison,
    leaderboard,
    questionStats,
  });
});
