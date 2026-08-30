import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiStudent } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts } from '@/db/schema';
import { gradeAndCloseAttempt } from '@/lib/attempts';
import { withDbLock } from '@/lib/db-lock';

type Ctx = { params: Promise<{ id: string }> };

const patchAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      response: z
        .object({
          key: z.string().optional(),
          value: z.union([z.number(), z.string()]).optional(),
        })
        .nullable()
        .optional(),
      state: z
        .enum(['not_seen', 'seen_unanswered', 'answered', 'answered_flagged', 'flagged_unanswered'])
        .optional(),
      timeSpentMs: z.number().int().min(0).optional(),
      visitCount: z.number().int().min(0).optional(),
    }),
  ),
});

const handler = withApi<Ctx>(async (req, { params }) => {
  const session = await apiStudent();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!attempt) throw new HttpError(404, 'not_found', 'Attempt not found');
  if (attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot save answers for another student’s attempt.');
  }

  // Check status
  if (attempt.status !== 'in_progress') {
    throw new HttpError(403, 'attempt_closed', 'This attempt is no longer in progress.');
  }

  // Past the deadline: close AND grade. This branch used to set status without
  // scoring, which combined with submit's short-circuit left the student at 0/0.
  if (Date.now() > new Date(attempt.deadlineAt).getTime()) {
    await gradeAndCloseAttempt(db, attemptId, 'auto_submitted');
    throw new HttpError(403, 'attempt_expired', 'Your time is up. This attempt has been auto-submitted.');
  }

  // sendBeacon (used by the beforeunload flush) always sends
  // Content-Type: text/plain, so the body is read as text and parsed by hand
  // rather than relying on req.json()'s content-type sniffing.
  const rawBody = await req.text().catch(() => '');
  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new HttpError(400, 'invalid_request', 'Expected a JSON body.');
  }

  const parsed = patchAnswersSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid answers payload', {
      issues: parsed.error.issues,
    });
  }

  const { answers } = parsed.data;
  const now = new Date();

  // Only questions actually in this attempt may be written.
  const inAttempt = new Set(attempt.questionOrder);
  const accepted = answers.filter((a) => inAttempt.has(a.questionId));

  if (accepted.length === 0) {
    return json({ ok: true, count: 0, savedAt: now.toISOString() });
  }

  await withDbLock(async () => {
    await db.transaction(async (tx) => {
      for (const item of accepted) {
        const updateFields: Record<string, unknown> = { updatedAt: now };

        if (item.response !== undefined) {
          if (item.response && item.response.value !== undefined && item.response.value !== null && item.response.value !== '') {
            const num = Number(item.response.value);
            updateFields.response = {
              key: item.response.key,
              value: Number.isNaN(num) ? item.response.value : num,
            };
          } else if (item.response && item.response.key) {
            // An MCQ pick carries no `value`; keep the key rather than falling
            // through and storing `{ key, value: '' }`.
            updateFields.response = { key: item.response.key };
          } else {
            // Cleared, or an empty numeric box: store SQL NULL so grading and
            // the result summary agree that nothing was attempted.
            updateFields.response = null;
          }
        }

        if (item.state !== undefined) {
          updateFields.state = item.state;
        }

        if (item.timeSpentMs !== undefined) {
          updateFields.timeSpentMs = sql`greatest(${attemptAnswers.timeSpentMs}, ${item.timeSpentMs})`;
        }

        if (item.visitCount !== undefined) {
          updateFields.visitCount = sql`greatest(${attemptAnswers.visitCount}, ${item.visitCount})`;
        }

        await tx
          .update(attemptAnswers)
          .set(updateFields)
          .where(and(eq(attemptAnswers.attemptId, attemptId), eq(attemptAnswers.questionId, item.questionId)));
      }
    });
  });

  return json({ ok: true, count: accepted.length, savedAt: now.toISOString() });
});

export const PATCH = handler;

/**
 * navigator.sendBeacon can only issue POST, so the beforeunload flush hit a
 * PATCH-only route and 405'd on every unload — silently, because a beacon has
 * no response to inspect. Same handler, both verbs.
 */
export const POST = handler;
