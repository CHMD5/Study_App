import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { extractAllImageTokens } from '@/lib/question-render';
import { getDb } from '@/db/client';
import { questionImages, questions, testQuestions } from '@/db/schema';

const BulkActionSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1, 'Select at least one question'),
  action: z.enum(['verify', 'archive', 'set_chapter', 'set_difficulty', 'delete']),
  chapter: z.string().trim().max(200).optional().nullable(),
  topic: z.string().trim().max(200).optional().nullable(),
  difficulty: z.coerce.number().int().min(1).max(10).optional().nullable(),
});

/**
 * POST /api/questions/bulk
 * Executes bulk operations on a set of question IDs.
 */
export const POST = withApi(async (req) => {
  const session = await apiTeacher();
  const body = await req.json().catch(() => ({}));
  const parsed = BulkActionSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_error', 'Invalid bulk action parameters', {
      issues: parsed.error.issues,
    });
  }

  const { questionIds, action, chapter, topic, difficulty } = parsed.data;
  const db = await getDb();

  const selectedQuestions = await db
    .select()
    .from(questions)
    .where(inArray(questions.id, questionIds));

  if (selectedQuestions.length === 0) {
    throw new HttpError(404, 'not_found', 'No matching questions found.');
  }

  if (action === 'archive') {
    await db
      .update(questions)
      .set({ status: 'archived', updatedAt: new Date(), lastEditedBy: session.userId })
      .where(inArray(questions.id, questionIds));

    return json({
      success: true,
      action: 'archive',
      affectedCount: questionIds.length,
      message: `Archived ${questionIds.length} question${questionIds.length === 1 ? '' : 's'}.`,
    });
  }

  if (action === 'set_chapter') {
    const updates: Record<string, any> = {
      chapter: chapter || null,
      updatedAt: new Date(),
      lastEditedBy: session.userId,
    };
    if (topic !== undefined) {
      updates.topic = topic || null;
    }

    await db.update(questions).set(updates).where(inArray(questions.id, questionIds));

    return json({
      success: true,
      action: 'set_chapter',
      affectedCount: questionIds.length,
      message: `Updated chapter for ${questionIds.length} question${questionIds.length === 1 ? '' : 's'}.`,
    });
  }

  if (action === 'set_difficulty') {
    await db
      .update(questions)
      .set({
        difficulty: difficulty ?? null,
        updatedAt: new Date(),
        lastEditedBy: session.userId,
      })
      .where(inArray(questions.id, questionIds));

    return json({
      success: true,
      action: 'set_difficulty',
      affectedCount: questionIds.length,
      message: `Updated difficulty for ${questionIds.length} question${questionIds.length === 1 ? '' : 's'}.`,
    });
  }

  if (action === 'delete') {
    // Check if any question is part of a test
    const inTests = await db
      .select({ questionId: testQuestions.questionId })
      .from(testQuestions)
      .where(inArray(testQuestions.questionId, questionIds));

    const inTestIds = new Set(inTests.map((t) => t.questionId));
    const deletable = questionIds.filter((id) => !inTestIds.has(id));

    if (deletable.length > 0) {
      await db.delete(questions).where(inArray(questions.id, deletable));
    }

    return json({
      success: true,
      action: 'delete',
      deletedCount: deletable.length,
      skippedCount: inTestIds.size,
      message:
        inTestIds.size > 0
          ? `Deleted ${deletable.length} question(s). ${inTestIds.size} skipped because they belong to configured tests.`
          : `Deleted ${deletable.length} question(s).`,
    });
  }

  if (action === 'verify') {
    // Load images for all selected questions
    const allImages = await db
      .select({ questionId: questionImages.questionId, placeholderId: questionImages.placeholderId })
      .from(questionImages)
      .where(inArray(questionImages.questionId, questionIds));

    const imagesByQuestion = new Map<string, Set<string>>();
    for (const img of allImages) {
      if (!imagesByQuestion.has(img.questionId)) {
        imagesByQuestion.set(img.questionId, new Set());
      }
      imagesByQuestion.get(img.questionId)!.add(img.placeholderId);
    }

    const verifiedIds: string[] = [];
    const skipped: Array<{ id: string; humanCode: string; reason: string }> = [];

    for (const q of selectedQuestions) {
      const code = q.humanCode ?? q.id;

      // Check answer
      if (q.answer === null || q.answer === undefined) {
        skipped.push({ id: q.id, humanCode: code, reason: 'Missing answer key' });
        continue;
      }

      // Check MCQ options
      if (q.type === 'mcq') {
        if (!q.options || q.options.length < 2) {
          skipped.push({ id: q.id, humanCode: code, reason: 'MCQ requires at least 2 options' });
          continue;
        }
        if (!('key' in q.answer) || !q.options.some((o) => o.key === (q.answer as any).key)) {
          skipped.push({ id: q.id, humanCode: code, reason: 'Answer key is not one of the options' });
          continue;
        }
      }

      // Check Numerical
      if (q.type === 'integer') {
        if ('key' in q.answer) {
          skipped.push({ id: q.id, humanCode: code, reason: 'Numerical answer cannot be an option key' });
          continue;
        }
      }

      // Check image placeholders
      const optionBodies = (q.options ?? []).map((o) => (typeof o === 'string' ? o : o.body ?? ''));
      const requiredImages = extractAllImageTokens(q.body, optionBodies);
      const uploadedImages = imagesByQuestion.get(q.id) ?? new Set();
      const unresolved = requiredImages.filter((tok) => !uploadedImages.has(tok));

      if (unresolved.length > 0) {
        skipped.push({
          id: q.id,
          humanCode: code,
          reason: `Unresolved image figures: ${unresolved.join(', ')}`,
        });
        continue;
      }

      verifiedIds.push(q.id);
    }

    if (verifiedIds.length > 0) {
      await db
        .update(questions)
        .set({
          status: 'verified',
          verifiedAt: new Date(),
          verifiedBy: session.userId,
          updatedAt: new Date(),
          lastEditedBy: session.userId,
        })
        .where(inArray(questions.id, verifiedIds));
    }

    return json({
      success: true,
      action: 'verify',
      verifiedCount: verifiedIds.length,
      skippedCount: skipped.length,
      skipped,
      message: `Verified ${verifiedIds.length} question${verifiedIds.length === 1 ? '' : 's'}.${
        skipped.length > 0 ? ` ${skipped.length} skipped due to missing answers or uncropped images.` : ''
      }`,
    });
  }

  throw new HttpError(400, 'unhandled_action', 'Action not supported.');
});
