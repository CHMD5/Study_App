import { and, eq, isNull } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { IngestPayload, IngestSolutionsPayload } from '@/lib/zod/ingest';
import { getDb } from '@/db/client';
import { questions, type QuestionAnswer } from '@/db/schema';
import crypto from 'crypto';

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

/**
 * POST /api/questions/ingest
 * Ingest standalone questions directly, or update solutions for standalone/paper questions.
 */
export const POST = withApi(async (req) => {
  const session = await apiTeacher();

  const body = await req.json().catch(() => null);
  if (!body) throw new HttpError(400, 'invalid_request', 'Expected a JSON body.');

  const db = await getDb();

  // Mode 2: Solutions Only
  if ('solutions' in body && Array.isArray(body.solutions)) {
    const parsed = IngestSolutionsPayload.parse(body);
    const targetPaperId = parsed.paperId ?? null;

    let updatedCount = 0;
    const unmatchedQnos: number[] = [];

    for (const sol of parsed.solutions) {
      const condition = targetPaperId
        ? and(eq(questions.paperId, targetPaperId), eq(questions.sourceQno, sol.sourceQno))
        : and(isNull(questions.paperId), eq(questions.sourceQno, sol.sourceQno));

      const existing = await db
        .select({ id: questions.id, type: questions.type, answer: questions.answer })
        .from(questions)
        .where(condition);

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
  const parsed = IngestPayload.parse(body);
  const prefix = `Q-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const rows = parsed.questions.map((q) => {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const subjShort = q.subject.slice(0, 3).toUpperCase();
    const humanCode = `${prefix}-${subjShort}-${String(q.sourceQno).padStart(3, '0')}-${randomSuffix}`;

    return {
      paperId: null,
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
      humanCode,
    };
  });

  const inserted = await db
    .insert(questions)
    .values(rows)
    .returning({ id: questions.id, sourceQno: questions.sourceQno, humanCode: questions.humanCode });

  return json({
    created: inserted.length,
    questionIds: inserted.map((r) => r.id),
  });
});
