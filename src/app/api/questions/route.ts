import { and, desc, eq, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questions } from '@/db/schema';

const PAGE_SIZE = 30;

/**
 * GET /api/questions?subject=&status=&chapter=&topic=&difficulty=&type=&q=&page=
 * Filters per LLD §5.1. `q` runs against the GIN full-text index on `body`.
 */
export const GET = withApi(async (req) => {
  await apiTeacher();
  const url = new URL(req.url);
  const p = url.searchParams;

  const conditions = [];
  const subject = p.get('subject');
  const status = p.get('status');
  const type = p.get('type');
  const chapter = p.get('chapter');
  const topic = p.get('topic');
  const difficulty = p.get('difficulty');
  const paperId = p.get('paperId');
  const search = p.get('q');
  const page = Math.max(1, Number(p.get('page') ?? '1'));

  if (subject) conditions.push(eq(questions.subject, subject as 'physics' | 'chemistry' | 'maths'));
  if (status) conditions.push(eq(questions.status, status as 'draft' | 'verified' | 'archived'));
  if (type) conditions.push(eq(questions.type, type as 'mcq' | 'integer'));
  if (chapter) conditions.push(eq(questions.chapter, chapter));
  if (topic) conditions.push(eq(questions.topic, topic));
  if (difficulty) conditions.push(eq(questions.difficulty, Number(difficulty)));
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

  return json({ questions: rows, page, pageSize: PAGE_SIZE, total: Number(count) });
});
