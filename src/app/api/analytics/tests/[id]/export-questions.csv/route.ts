import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, withApi } from '@/lib/http';
import { computeDiscriminationIndex } from '@/lib/analytics-metrics';
import { getDb } from '@/db/client';
import { tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: testId } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  // Load evaluated attempts for tertile calculation
  const attemptsRes = await db.$client.query<{
    student_id: string;
    total_marks: number;
  }>(
    `SELECT student_id, total_marks
     FROM attempts
     WHERE test_id = $1 AND status <> 'in_progress' AND total_marks IS NOT NULL
     ORDER BY total_marks DESC`,
    [testId],
  );

  const tertileSize = Math.max(1, Math.floor(attemptsRes.rows.length / 3));
  const topScorerIds = new Set(attemptsRes.rows.slice(0, tertileSize).map((a) => a.student_id));
  const bottomScorerIds = new Set(attemptsRes.rows.slice(-tertileSize).map((a) => a.student_id));

  // Accuracy per tertile for discrimination index
  const tertileAccuracyRes = await db.$client.query<{
    question_id: string;
    student_id: string;
    is_correct: boolean;
  }>(
    `SELECT aa.question_id, a.student_id, aa.is_correct
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

  // Question calibration rows
  const qRowsRes = await db.$client.query<{
    position: number;
    human_code: string | null;
    subject: string;
    chapter: string | null;
    topic: string | null;
    type: string;
    difficulty: number | null;
    times_served: number;
    times_attempted: number;
    pct_correct: number | null;
    avg_time_s: number | null;
    expected_time_s: number | null;
    question_id: string;
  }>(
    `SELECT
       tq.position,
       q.human_code,
       q.subject,
       COALESCE(q.chapter, 'General') as chapter,
       COALESCE(q.topic, '-') as topic,
       q.type,
       q.difficulty,
       COUNT(aa.attempt_id)::int as times_served,
       COUNT(aa.attempt_id) FILTER (WHERE aa.response IS NOT NULL)::int as times_attempted,
       ROUND((COUNT(aa.attempt_id) FILTER (WHERE aa.is_correct = true)::numeric / NULLIF(COUNT(aa.attempt_id) FILTER (WHERE aa.response IS NOT NULL), 0)) * 100, 1) as pct_correct,
       ROUND(AVG(aa.time_spent_ms / 1000)::numeric, 1) as avg_time_s,
       q.expected_time_s,
       tq.question_id
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     LEFT JOIN attempts a ON a.test_id = tq.test_id AND a.status <> 'in_progress'
     LEFT JOIN attempt_answers aa ON aa.attempt_id = a.id AND aa.question_id = tq.question_id
     WHERE tq.test_id = $1
     GROUP BY tq.position, q.human_code, q.subject, q.chapter, q.topic, q.type, q.difficulty, q.expected_time_s, tq.question_id
     ORDER BY tq.position ASC`,
    [testId],
  );

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    let s = String(str);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const headers = [
    'Q#',
    'Question Code',
    'Subject',
    'Chapter',
    'Topic',
    'Type',
    'Difficulty',
    'Times Served',
    'Times Attempted',
    'Accuracy (%)',
    'Avg Time (s)',
    'Expected Time (s)',
    'Discrimination Index',
  ];

  const lines = [headers.join(',')];

  for (const r of qRowsRes.rows) {
    const tStat = tertileStats.get(r.question_id);
    const di = tStat
      ? computeDiscriminationIndex(
          tStat.topCorrect,
          tStat.topTotal,
          tStat.bottomCorrect,
          tStat.bottomTotal,
        )
      : null;

    const line = [
      r.position,
      escapeCsv(r.human_code ?? `Q${r.position}`),
      escapeCsv(r.subject),
      escapeCsv(r.chapter),
      escapeCsv(r.topic),
      escapeCsv(r.type.toUpperCase()),
      r.difficulty ?? 5,
      r.times_served,
      r.times_attempted,
      r.pct_correct ?? 0,
      r.avg_time_s ?? 0,
      r.expected_time_s ?? 120,
      di !== null ? di : '""',
    ].join(',');
    lines.push(line);
  }

  const csvContent = lines.join('\r\n');
  const safeTitle = test.title.replace(/[^a-zA-Z0-9_-]/g, '_');

  return new Response('\uFEFF' + csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}-question-calibration.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
