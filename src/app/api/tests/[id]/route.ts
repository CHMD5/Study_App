import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, questions, testQuestions, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

const patchTestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  durationS: z.number().int().min(60).max(86400).optional(),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  maxAttempts: z.number().int().min(1).optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  resultsPolicy: z.enum(['immediate', 'on_release']).optional(),
  isPublished: z.boolean().optional(),
});

export const GET = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) {
    throw new HttpError(404, 'not_found', 'Test not found');
  }

  const assignedQuestions = await db
    .select({
      testId: testQuestions.testId,
      questionId: testQuestions.questionId,
      position: testQuestions.position,
      marksCorrect: testQuestions.marksCorrect,
      marksWrong: testQuestions.marksWrong,
      marksUnattempted: testQuestions.marksUnattempted,
      subject: questions.subject,
      type: questions.type,
      status: questions.status,
      body: questions.body,
      options: questions.options,
      humanCode: questions.humanCode,
      difficulty: questions.difficulty,
      expectedTimeS: questions.expectedTimeS,
      chapter: questions.chapter,
      topic: questions.topic,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(questions.id, testQuestions.questionId))
    .where(eq(testQuestions.testId, id))
    .orderBy(asc(testQuestions.position));

  const [attemptCount] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(attempts)
    .where(eq(attempts.testId, id));

  return json({
    ...test,
    questions: assignedQuestions,
    attemptCount: attemptCount?.count ?? 0,
  });
});

export const PATCH = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = patchTestSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid test settings', {
      issues: parsed.error.issues,
    });
  }

  const db = await getDb();
  const [existing] = await db.select().from(tests).where(eq(tests.id, id));
  if (!existing) throw new HttpError(404, 'not_found', 'Test not found');

  // Settings that change how an attempt is scored or timed cannot be edited
  // once students have sat the test — attempts materialise their own deadline
  // and question order at start, so changing these afterwards silently
  // desynchronises live and historical attempts from the test they belong to.
  const FROZEN_AFTER_ATTEMPTS = ['durationS', 'maxAttempts', 'shuffleQuestions', 'shuffleOptions'] as const;
  const touchedFrozen = FROZEN_AFTER_ATTEMPTS.filter((k) => k in parsed.data && parsed.data[k] !== existing[k]);

  if (touchedFrozen.length > 0) {
    const [{ attemptCount }] = await db
      .select({ attemptCount: sql<number>`cast(count(*) as int)` })
      .from(attempts)
      .where(eq(attempts.testId, id));

    if (attemptCount > 0) {
      throw new HttpError(
        409,
        'test_in_use',
        `This test already has ${attemptCount} student attempt(s), so ${touchedFrozen.join(', ')} can no longer be changed. Title, description, window and results policy are still editable.`,
        { attemptCount, frozen: touchedFrozen },
      );
    }
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if ('opensAt' in parsed.data) {
    updateData.opensAt = parsed.data.opensAt ? new Date(parsed.data.opensAt) : null;
  }
  if ('closesAt' in parsed.data) {
    updateData.closesAt = parsed.data.closesAt ? new Date(parsed.data.closesAt) : null;
  }

  // Switching back to 'immediate' should not leave a stale release stamp behind.
  if (parsed.data.resultsPolicy === 'immediate') {
    updateData.releasedAt = null;
  }

  const [updated] = await db.update(tests).set(updateData).where(eq(tests.id, id)).returning();

  return json(updated);
});

export const DELETE = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [existing] = await db.select().from(tests).where(eq(tests.id, id));
  if (!existing) throw new HttpError(404, 'not_found', 'Test not found');

  // Check if attempts exist
  const existingAttempts = await db.select({ id: attempts.id }).from(attempts).where(eq(attempts.testId, id));
  if (existingAttempts.length > 0) {
    throw new HttpError(
      409,
      'test_in_use',
      `Cannot delete test because ${existingAttempts.length} student attempt(s) exist for it.`,
    );
  }

  await db.delete(tests).where(eq(tests.id, id));
  return json({ ok: true, deletedId: id });
});
