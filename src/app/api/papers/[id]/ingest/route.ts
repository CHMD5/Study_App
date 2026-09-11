import { and, eq, inArray } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, isForeignKeyViolation, isUniqueViolation, json, withApi } from '@/lib/http';
import { IngestPayload, IngestSolutionsPayload } from '@/lib/zod/ingest';
import { getDb } from '@/db/client';
import { papers, questions, type ExtractionMeta, type QuestionAnswer } from '@/db/schema';
import { withDbLock } from '@/lib/db-lock';

type Ctx = { params: Promise<{ id: string }> };

function parseQuestionAnswer(raw: string | null | undefined, type?: 'mcq' | 'integer'): QuestionAnswer | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (type === 'mcq' || /^[A-D]$/i.test(trimmed)) {
    return { key: trimmed.toUpperCase() };
  }

  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return { value: num };
  }

  if (type === 'integer') {
    return null;
  }
  return { key: trimmed };
}

export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiTeacher();
  const { id: paperId } = await params;

  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, paperId));
  if (!paper) throw new HttpError(404, 'not_found', 'Paper not found.');

  const body = await req.json().catch(() => null);
  if (!body) throw new HttpError(400, 'invalid_request', 'Expected a JSON body.');

  // Mode 2: Solutions Only for this paper
  if ('solutions' in body && Array.isArray(body.solutions)) {
    const parsed = IngestSolutionsPayload.parse(body);

    let updatedCount = 0;
    const unmatchedQnos: number[] = [];

    for (const sol of parsed.solutions) {
      const existing = await db
        .select({ id: questions.id, type: questions.type, answer: questions.answer })
        .from(questions)
        .where(and(eq(questions.paperId, paperId), eq(questions.sourceQno, sol.sourceQno)));

      if (existing.length === 0) {
        unmatchedQnos.push(sol.sourceQno);
        continue;
      }

      for (const q of existing) {
        const updates: Record<string, unknown> = {
          solution: sol.solution,
          lastEditedBy: session.userId,
          updatedAt: new Date(),
        };
        if (sol.answer && !q.answer) {
          const parsedAns = parseQuestionAnswer(sol.answer, q.type);
          if (parsedAns) updates.answer = parsedAns;
        }
        if (sol.sourcePage) {
          updates.sourcePage = sol.sourcePage;
        }
        await db.update(questions).set(updates).where(eq(questions.id, q.id));
        updatedCount++;
      }
    }

    return json({
      updated: updatedCount,
      totalSolutions: parsed.solutions.length,
      unmatchedQnos,
    });
  }

  // Mode 1: Questions Only OR Mode 3: Both Questions & Solutions
  const promptVersion = typeof body.promptVersion === 'string' ? body.promptVersion : undefined;
  const parsed = IngestPayload.parse(body);

  const rows = parsed.questions.map((q) => ({
    paperId,
    sourceQno: q.sourceQno,
    sourcePage: q.sourcePage ?? null,
    subject: q.subject,
    type: q.type,
    status: 'draft' as const,
    body: q.body,
    options: q.type === 'mcq' ? q.options : [],
    answer: parseQuestionAnswer(q.answer, q.type),
    solution: q.solution?.trim() || null,
    extractionNotes: q.uncertain.length > 0 ? { uncertain: q.uncertain } : null,
    createdBy: session.userId,
    lastEditedBy: session.userId,
    humanCode: `${paper.code}-${q.subject[0].toUpperCase()}-${String(q.sourceQno).padStart(3, '0')}`,
  }));

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
