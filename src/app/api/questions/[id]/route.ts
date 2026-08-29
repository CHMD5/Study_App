import { and, eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, isForeignKeyViolation, json, withApi } from '@/lib/http';
import { QuestionUpdateSchema } from '@/lib/zod/question';
import { getDb } from '@/db/client';
import { questionImages, questions } from '@/db/schema';
import { deleteQuestionImageDir } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  if (!question) throw new HttpError(404, 'not_found', 'Question not found.');

  const images = await db.select().from(questionImages).where(eq(questionImages.questionId, id));
  return json({ ...question, images });
});

/**
 * LLD §1.3 / §4.4: five teachers editing one bank need an optimistic-concurrency
 * check on every write. Locally there is one teacher, but the guard is 5 lines
 * and keeps the write path identical to production — no call site changes when
 * more teacher accounts are added later.
 *
 * `WHERE id = $1 AND updated_at = $2` — zero rows affected means someone else's
 * write landed first; the client refetches and reprompts rather than silently
 * clobbering it.
 */
export const PATCH = withApi<Ctx>(async (req, { params }) => {
  const session = await apiTeacher();
  const { id } = await params;
  const body = QuestionUpdateSchema.parse(await req.json().catch(() => ({})));

  const db = await getDb();
  const { updatedAt, ...patch } = body;

  const [updated] = await db
    .update(questions)
    .set({ ...patch, lastEditedBy: session.userId })
    .where(and(eq(questions.id, id), eq(questions.updatedAt, new Date(updatedAt))))
    .returning();

  if (!updated) {
    const [current] = await db.select().from(questions).where(eq(questions.id, id));
    if (!current) throw new HttpError(404, 'not_found', 'Question not found.');
    throw new HttpError(
      409,
      'stale_write',
      'This question was edited by someone else since you loaded it. Refresh and reapply your changes.',
      { current },
    );
  }

  return json(updated);
});

/**
 * `question_images` and `question_revisions` rows cascade automatically
 * (ON DELETE CASCADE). `test_questions` deliberately does not (ON DELETE
 * RESTRICT, LLD §4.6) — a question already used in a real test must be
 * archived, not deleted, so a live test can never lose one of its questions
 * out from under it. That constraint violation is caught below and turned
 * into a specific message rather than a bare 500.
 */
export const DELETE = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  if (!question) throw new HttpError(404, 'not_found', 'Question not found.');

  try {
    await db.delete(questions).where(eq(questions.id, id));
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(
        409,
        'question_in_use',
        'This question is used in a test and cannot be deleted. Set its status to archived instead.',
      );
    }
    throw err;
  }

  // DB rows are gone; the cropped image files on disk are not — clean up the
  // whole images/<questionId>/ folder rather than tracking individual paths.
  await deleteQuestionImageDir(id);

  return json({ ok: true });
});
