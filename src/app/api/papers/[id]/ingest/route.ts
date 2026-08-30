import { eq, inArray } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, isForeignKeyViolation, isUniqueViolation, json, withApi } from '@/lib/http';
import { IngestPayload } from '@/lib/zod/ingest';
import { getDb } from '@/db/client';
import { papers, questions, type ExtractionMeta } from '@/db/schema';
import { withDbLock } from '@/lib/db-lock';

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

  // ---------------------------------------------------------------------
  // Re-ingest handling.
  //
  // human_code is deterministic (`<paperCode>-<S>-<qno>`), so pasting a
  // corrected JSON for a paper that already has questions used to hit the
  // UNIQUE constraint and surface as a bare 500 'internal_error' with no
  // explanation of what went wrong or how to proceed.
  //
  // Default is now an explicit 409 naming the collision. `?mode=replace`
  // deletes the paper's existing questions first — refused if any of them are
  // already used in a test (test_questions is ON DELETE RESTRICT by design), so
  // a live paper cannot be pulled out from under a test.
  // ---------------------------------------------------------------------
  const mode = new URL(req.url).searchParams.get('mode');
  const codes = rows.map((r) => r.humanCode);

  const clashes = await db
    .select({ id: questions.id, humanCode: questions.humanCode })
    .from(questions)
    .where(inArray(questions.humanCode, codes));

  if (clashes.length > 0 && mode !== 'replace') {
    throw new HttpError(
      409,
      'already_ingested',
      `${clashes.length} of these ${rows.length} question(s) were already ingested from this paper. Re-send with ?mode=replace to discard the existing ones and ingest afresh.`,
      { existingCount: clashes.length, incomingCount: rows.length },
    );
  }

  let inserted: { id: string; sourceQno: number | null }[] = [];

  try {
    await withDbLock(async () => {
      await db.transaction(async (tx) => {
        if (mode === 'replace') {
          // Scoped to this paper, not to the colliding codes, so a re-ingest
          // that renumbers questions doesn't leave the old ones orphaned.
          await tx.delete(questions).where(eq(questions.paperId, paperId));
        }

        inserted = await tx
          .insert(questions)
          .values(rows)
          .returning({ id: questions.id, sourceQno: questions.sourceQno });
      });
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(
        409,
        'questions_in_use',
        'One or more of this paper’s existing questions are already used in a test and cannot be replaced. Remove them from their test(s) first.',
      );
    }
    if (isUniqueViolation(err)) {
      throw new HttpError(
        409,
        'duplicate_question_code',
        'Some of these questions collide with existing ones. Re-send with ?mode=replace to overwrite this paper’s questions.',
      );
    }
    throw err;
  }

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
