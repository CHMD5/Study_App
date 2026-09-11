import { asc, eq } from 'drizzle-orm';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { testQuestions, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/tests/:id/clone
 * Clones a test and all its assigned questions into a new draft test.
 */
export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiTeacher();
  const { id: sourceTestId } = await params;
  const db = await getDb();

  const [sourceTest] = await db.select().from(tests).where(eq(tests.id, sourceTestId));
  if (!sourceTest) {
    throw new HttpError(404, 'not_found', 'Test not found.');
  }

  const assigned = await db
    .select()
    .from(testQuestions)
    .where(eq(testQuestions.testId, sourceTestId))
    .orderBy(asc(testQuestions.position));

  const [clonedTest] = await db
    .insert(tests)
    .values({
      title: `${sourceTest.title} (Copy)`,
      description: sourceTest.description,
      durationS: sourceTest.durationS,
      opensAt: sourceTest.opensAt,
      closesAt: sourceTest.closesAt,
      maxAttempts: sourceTest.maxAttempts,
      shuffleQuestions: sourceTest.shuffleQuestions,
      shuffleOptions: sourceTest.shuffleOptions,
      resultsPolicy: sourceTest.resultsPolicy,
      isPublished: false,
      releasedAt: null,
      createdBy: session.userId,
    })
    .returning();

  if (assigned.length > 0) {
    await db.insert(testQuestions).values(
      assigned.map((q) => ({
        testId: clonedTest.id,
        questionId: q.questionId,
        position: q.position,
        marksCorrect: q.marksCorrect,
        marksWrong: q.marksWrong,
        marksUnattempted: q.marksUnattempted,
      })),
    );
  }

  return json({
    success: true,
    test: clonedTest,
    questionCount: assigned.length,
    message: `Cloned as "${clonedTest.title}" with ${assigned.length} question(s).`,
  });
});
