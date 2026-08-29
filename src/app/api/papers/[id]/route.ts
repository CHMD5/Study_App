import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, isForeignKeyViolation, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { papers, questions } from '@/db/schema';
import { deleteIfExists, deleteQuestionImageDir } from '@/lib/storage';

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApi<Ctx>(async (_req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();
  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) throw new HttpError(404, 'not_found', 'Paper not found.');
  return json(paper);
});

/**
 * Deleting a paper that still has questions is a two-step confirmation, not a
 * silent cascade: the plain DELETE (no `?cascade=true`) refuses and reports how
 * many questions would go with it, so the UI can show a specific "delete this
 * paper AND its 75 questions?" prompt rather than the generic one. Passing
 * `?cascade=true` performs that cascade — the paper's questions (and, via their
 * own ON DELETE CASCADE, question_images/question_revisions rows) are deleted
 * in the same transaction as the paper, so a failure partway through leaves
 * neither half gone.
 *
 * A question already used in a real test (test_questions is ON DELETE
 * RESTRICT, LLD §4.6) blocks the whole cascade — the transaction rolls back and
 * the teacher is told to archive/remove it from its test(s) first, rather than
 * silently deleting every other question in the paper but not that one.
 */
export const DELETE = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [paper] = await db.select().from(papers).where(eq(papers.id, id));
  if (!paper) throw new HttpError(404, 'not_found', 'Paper not found.');

  const cascade = new URL(req.url).searchParams.get('cascade') === 'true';
  const paperQuestions = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.paperId, id));

  if (paperQuestions.length > 0 && !cascade) {
    throw new HttpError(
      409,
      'paper_has_questions',
      `${paperQuestions.length} question(s) reference this paper. Retry with cascade to delete them too, or leave the paper registered.`,
      { questionCount: paperQuestions.length },
    );
  }

  try {
    await db.transaction(async (tx) => {
      if (paperQuestions.length > 0) {
        await tx.delete(questions).where(eq(questions.paperId, id));
      }
      await tx.delete(papers).where(eq(papers.id, id));
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(
        409,
        'questions_in_use',
        'One or more questions from this paper are used in a test and cannot be deleted. Archive or remove them from their test(s) first.',
      );
    }
    throw err;
  }

  // DB rows are gone; clean up disk — each deleted question's image folder,
  // then the paper's own PDF file.
  await Promise.all(paperQuestions.map((q) => deleteQuestionImageDir(q.id)));
  await deleteIfExists(paper.filePath);

  return json({ ok: true, deletedQuestions: paperQuestions.length });
});
