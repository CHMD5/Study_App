import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { IngestPayload } from '@/lib/zod/ingest';
import { getDb } from '@/db/client';
import { papers, questions, type ExtractionMeta } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

/**
 * LLD §5.1 / §5.1's 422 example: validation is all-or-nothing. If ANY question
 * fails the Zod schema, ZERO rows are written — a partially-ingested 68-of-75
 * paper is worse than fixing the JSON once and re-pasting.
 */
export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiTeacher();
  const { id: paperId } = await params;

  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, paperId));
  if (!paper) throw new HttpError(404, 'not_found', 'Paper not found.');

  const body = await req.json().catch(() => null);
  if (!body) throw new HttpError(400, 'invalid_request', 'Expected a JSON body.');

  const promptVersion = typeof body.promptVersion === 'string' ? body.promptVersion : undefined;

  // Validate the whole payload BEFORE touching the database. A single ZodError
  // here — caught by withApi — produces the { error: 'validation_failed',
  // issues: [...] } shape with nothing written, satisfying all-or-nothing by
  // construction rather than by wrapping inserts in a rollback.
  const parsed = IngestPayload.parse(body);

  const rows = parsed.questions.map((q) => ({
    paperId,
    sourceQno: q.sourceQno,
    subject: q.subject,
    type: q.type,
    status: 'draft' as const,
    body: q.body,
    options: q.type === 'mcq' ? q.options : [],
    extractionNotes: q.uncertain.length > 0 ? { uncertain: q.uncertain } : null,
    createdBy: session.userId,
    lastEditedBy: session.userId,
    humanCode: `${paper.code}-${q.subject[0].toUpperCase()}-${String(q.sourceQno).padStart(3, '0')}`,
  }));

  const inserted = await db.insert(questions).values(rows).returning({ id: questions.id, sourceQno: questions.sourceQno });

  // Seed each question's image placeholders as unresolved rows would require a
  // question_images entry, but that table's NOT NULL storage_path means a
  // placeholder can't be represented until it's cropped — so instead the
  // editor (stage 5) diffs body's [[IMG:id]] tokens against question_images
  // rows live. Nothing to insert here; imagePlaceholders' hints are informational
  // and are not persisted separately from the body text that already carries them.

  const extractionMeta: ExtractionMeta = {
    promptVersion,
    extractedAt: new Date().toISOString(),
    detectedTitle: parsed.paperMeta?.detectedTitle ?? null,
    totalQuestionsFound: parsed.paperMeta?.totalQuestionsFound,
  };
  await db.update(papers).set({ extractionMeta }).where(eq(papers.id, paperId));

  return json({
    created: inserted.length,
    questionIds: inserted.map((r) => r.id),
  });
});
