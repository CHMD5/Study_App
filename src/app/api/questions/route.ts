import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questions } from '@/db/schema';

const PAGE_SIZE = 30;

/**
 * Query params are validated rather than cast.
 *
 * `subject as 'physics' | …` was a lie to the type checker: an unrecognised
 * value went straight into the SQL as an invalid enum literal and came back as
 * a 500, and `Number('x')` for difficulty produced a NaN comparison. Anything
 * unrecognised is now a 422 naming the offending parameter.
 */
const QuerySchema = z.object({
  subject: z.enum(['physics', 'chemistry', 'maths']).optional(),
  status: z.enum(['draft', 'verified', 'archived']).optional(),
  type: z.enum(['mcq', 'integer']).optional(),
  chapter: z.string().min(1).max(200).optional(),
  topic: z.string().min(1).max(200).optional(),
  difficulty: z.coerce.number().int().min(1).max(10).optional(),
  paperId: z.string().uuid().optional(),
  q: z.string().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/**
 * GET /api/questions?subject=&status=&chapter=&topic=&difficulty=&type=&q=&page=
 * Filters per LLD §5.1. `q` runs against the GIN full-text index on `body`.
 */
export const GET = withApi(async (req) => {
  await apiTeacher();
  const url = new URL(req.url);

  // Drop blank values so `?subject=` behaves as "unset" rather than failing.
  const raw = Object.fromEntries([...url.searchParams.entries()].filter(([, v]) => v !== ''));
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, 'invalid_query', 'One or more filters are not valid.', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { subject, status, type, chapter, topic, difficulty, paperId, q: search, page } = parsed.data;

  const conditions = [];
  if (subject) conditions.push(eq(questions.subject, subject));
  if (status) conditions.push(eq(questions.status, status));
  if (type) conditions.push(eq(questions.type, type));
  if (chapter) conditions.push(eq(questions.chapter, chapter));
  if (topic) conditions.push(eq(questions.topic, topic));
  if (difficulty !== undefined) conditions.push(eq(questions.difficulty, difficulty));
  if (paperId) conditions.push(eq(questions.paperId, paperId));
  if (search) {
    conditions.push(sql`to_tsvector('english', ${questions.body}) @@ plainto_tsquery('english', ${search})`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const db = await getDb();

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(questions)
      .where(where)
      .orderBy(desc(questions.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: sql<number>`count(*)` }).from(questions).where(where),
  ]);

  const total = Number(count);

  return json({
    questions: rows,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
});
