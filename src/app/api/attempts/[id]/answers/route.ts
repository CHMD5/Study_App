import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiStudent } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptAnswers, attempts } from '@/db/schema';

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

export const PATCH = withApi<Ctx>(async (req, { params }) => {
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

  // Check deadline
  if (Date.now() > new Date(attempt.deadlineAt).getTime()) {
    await db
      .update(attempts)
      .set({ status: 'auto_submitted', submittedAt: new Date() })
      .where(eq(attempts.id, attemptId));

    throw new HttpError(403, 'attempt_expired', 'Your time is up. This attempt has been auto-submitted.');
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchAnswersSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid answers payload', {
      issues: parsed.error.issues,
    });
  }

  const { answers } = parsed.data;
  const now = new Date();

  // Update in a transaction for consistency
  await db.transaction(async (tx) => {
    for (const item of answers) {
      const updateFields: Record<string, unknown> = {
        updatedAt: now,
      };

      if (item.response !== undefined) {
        // Format integer/float value as number if possible
        if (item.response && item.response.value !== undefined && item.response.value !== null && item.response.value !== '') {
          const num = Number(item.response.value);
          updateFields.response = {
            key: item.response.key,
            value: Number.isNaN(num) ? item.response.value : num,
          };
        } else {
          updateFields.response = item.response;
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
        .where(
          and(
            eq(attemptAnswers.attemptId, attemptId),
            eq(attemptAnswers.questionId, item.questionId),
          ),
        );
    }
  });

  return json({ ok: true, count: answers.length, savedAt: now.toISOString() });
});
