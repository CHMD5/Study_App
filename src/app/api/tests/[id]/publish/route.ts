import { eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { questions, testQuestions, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

export const POST = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id } = await params;
  const db = await getDb();

  const [test] = await db.select().from(tests).where(eq(tests.id, id));
  if (!test) throw new HttpError(404, 'not_found', 'Test not found');

  const assigned = await db
    .select({
      position: testQuestions.position,
      questionId: questions.id,
      humanCode: questions.humanCode,
      status: questions.status,
      subject: questions.subject,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(questions.id, testQuestions.questionId))
    .where(eq(testQuestions.testId, id));

  if (assigned.length === 0) {
    throw new HttpError(422, 'publish_gate_failed', 'Cannot publish a test with no questions assigned.');
  }

  const unverified = assigned.filter((q) => q.status !== 'verified');
  if (unverified.length > 0) {
    throw new HttpError(
      422,
      'publish_gate_failed',
      `Cannot publish: ${unverified.length} question(s) are not verified. All questions must be verified before publishing.`,
      {
        unverified: unverified.map((u) => ({
          position: u.position,
          questionId: u.questionId,
          humanCode: u.humanCode,
          status: u.status,
          subject: u.subject,
        })),
      },
    );
  }

  const [updated] = await db.update(tests).set({ isPublished: true }).where(eq(tests.id, id)).returning();

  return json(updated);
});
