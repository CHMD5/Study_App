import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { IngestPayload } from '@/lib/zod/ingest';
import { getDb } from '@/db/client';
import { questions } from '@/db/schema';
import crypto from 'crypto';

/**
 * POST /api/questions/ingest
 * Ingest standalone questions directly without requiring an associated paper.
 */
export const POST = withApi(async (req) => {
  const session = await apiTeacher();

  const body = await req.json().catch(() => null);
  if (!body) throw new HttpError(400, 'invalid_request', 'Expected a JSON body.');

  const parsed = IngestPayload.parse(body);

  const prefix = `Q-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const rows = parsed.questions.map((q) => {
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const subjShort = q.subject.slice(0, 3).toUpperCase();
    const humanCode = `${prefix}-${subjShort}-${String(q.sourceQno).padStart(3, '0')}-${randomSuffix}`;

    return {
      paperId: null,
      sourceQno: q.sourceQno,
      subject: q.subject,
      type: q.type,
      status: 'draft' as const,
      body: q.body,
      options: q.type === 'mcq' ? q.options : [],
      extractionNotes: q.uncertain.length > 0 ? { uncertain: q.uncertain } : null,
      createdBy: session.userId,
      lastEditedBy: session.userId,
      humanCode,
    };
  });

  const db = await getDb();
  const inserted = await db
    .insert(questions)
    .values(rows)
    .returning({ id: questions.id, sourceQno: questions.sourceQno, humanCode: questions.humanCode });

  return json({
    created: inserted.length,
    questionIds: inserted.map((r) => r.id),
  });
});
