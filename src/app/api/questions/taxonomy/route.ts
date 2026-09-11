import { desc, isNotNull, sql } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { papers, questions } from '@/db/schema';

/**
 * GET /api/questions/taxonomy
 * Returns distinct subjects, chapters, topics, and registered papers for autocompletion & filtering.
 */
export const GET = withApi(async () => {
  await apiTeacher();
  const db = await getDb();

  const [chaptersRes, topicsRes, papersRes] = await Promise.all([
    db
      .select({
        subject: questions.subject,
        chapter: questions.chapter,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(questions)
      .where(isNotNull(questions.chapter))
      .groupBy(questions.subject, questions.chapter)
      .orderBy(questions.subject, questions.chapter),

    db
      .select({
        chapter: questions.chapter,
        topic: questions.topic,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(questions)
      .where(isNotNull(questions.topic))
      .groupBy(questions.chapter, questions.topic)
      .orderBy(questions.topic),

    db
      .select({
        id: papers.id,
        title: papers.title,
        code: papers.code,
      })
      .from(papers)
      .orderBy(desc(papers.createdAt)),
  ]);

  return json({
    chapters: chaptersRes.filter((c) => Boolean(c.chapter)),
    topics: topicsRes.filter((t) => Boolean(t.topic)),
    papers: papersRes,
  });
});
