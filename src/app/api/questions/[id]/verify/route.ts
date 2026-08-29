import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questionImages, questions } from '@/db/schema';
import { extractAllImageTokens } from '@/lib/question-render';

type Ctx = { params: Promise<{ id: string }> };

/**
 * LLD §1.5 step 10: cannot verify while (a) answer is null, (b) any [[IMG:...]]
 * placeholder is unresolved, (c) LaTeX fails to compile. (c) is checked
 * client-side by the live KaTeX preview before this is ever called — the
 * server re-checks (a) and (b), which are the two a client could get wrong or
 * bypass, and additionally re-validates the DB CHECK constraints' preconditions
 * so the error message is specific rather than a raw constraint-violation.
 */
export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiTeacher();
  const { id } = await params;

  const db = await getDb();
  const [question] = await db.select().from(questions).where(eq(questions.id, id));
  if (!question) throw new HttpError(404, 'not_found', 'Question not found.');

  const reasons: string[] = [];

  if (question.answer === null || question.answer === undefined) {
    reasons.push('No answer key is set.');
  }
  if (question.type === 'mcq' && question.options.length < 2) {
    reasons.push('An mcq question needs at least 2 options.');
  }

  // Scans the question body AND every option's body — an image placeholder
  // living only inside an option (a match-the-column diagram, say) must block
  // verify exactly like one in the body would.
  const tokens = extractAllImageTokens(question.body, question.options.map((o) => o.body));
  if (tokens.length > 0) {
    const images = await db.select().from(questionImages).where(eq(questionImages.questionId, id));
    const resolved = new Set(images.map((i) => i.placeholderId));
    const unresolved = tokens.filter((t) => !resolved.has(t));
    if (unresolved.length > 0) {
      reasons.push(`${unresolved.length} image placeholder(s) unresolved: ${unresolved.join(', ')}`);
    }
  }

  if (reasons.length > 0) {
    throw new HttpError(422, 'verify_gate_failed', 'This question cannot be verified yet.', { reasons });
  }

  const [updated] = await db
    .update(questions)
    .set({ status: 'verified', verifiedAt: new Date(), verifiedBy: session.userId })
    .where(eq(questions.id, id))
    .returning();

  return json(updated);
});
