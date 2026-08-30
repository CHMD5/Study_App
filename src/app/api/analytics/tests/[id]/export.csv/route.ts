import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError } from '@/lib/http';
import { getDb } from '@/db/client';
import { tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx): Promise<Response> {
  await apiTeacher();
  const { id: testId } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const rowsRes = await db.$client.query<{
    rank: number;
    full_name: string;
    username: string;
    batch: string | null;
    total_marks: string | number;
    percentile: number;
    total_time_s: number | null;
    submitted_at: string;
  }>(
    `SELECT
       r.rank,
       p.full_name,
       p.username,
       p.batch,
       r.total_marks,
       r.percentile,
       a.total_time_s,
       a.submitted_at
     FROM v_test_ranks r
     JOIN profiles p ON p.id = r.student_id
     JOIN attempts a ON a.test_id = r.test_id AND a.student_id = r.student_id AND a.attempt_no = r.attempt_no
     WHERE r.test_id = $1
     ORDER BY r.rank ASC, a.submitted_at ASC`,
    [testId],
  );

  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers = ['Rank', 'Student Name', 'Username', 'Batch', 'Total Marks', 'Percentile', 'Total Time (min)', 'Submitted At'];
  const lines = [headers.join(',')];

  for (const row of rowsRes.rows) {
    const line = [
      row.rank,
      escapeCsv(row.full_name),
      escapeCsv(row.username),
      escapeCsv(row.batch ?? 'General'),
      Number(row.total_marks),
      Number(row.percentile),
      Math.round((row.total_time_s ?? 0) / 60),
      escapeCsv(row.submitted_at),
    ].join(',');
    lines.push(line);
  }

  const csvContent = lines.join('\r\n');
  const safeTitle = test.title.replace(/[^a-zA-Z0-9_-]/g, '_');

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeTitle}-results.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
