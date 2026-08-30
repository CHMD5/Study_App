import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attempts, testQuestions, tests } from '@/db/schema';

const createTestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional().nullable(),
  durationS: z.number().int().min(60, 'Duration must be at least 1 minute (60s)').max(86400),
  opensAt: z.string().datetime().optional().nullable(),
  closesAt: z.string().datetime().optional().nullable(),
  maxAttempts: z.number().int().min(1).default(1),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  resultsPolicy: z.enum(['immediate', 'on_release']).default('immediate'),
});

export const GET = withApi(async () => {
  await apiTeacher();
  const db = await getDb();

  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      durationS: tests.durationS,
      opensAt: tests.opensAt,
      closesAt: tests.closesAt,
      maxAttempts: tests.maxAttempts,
      shuffleQuestions: tests.shuffleQuestions,
      shuffleOptions: tests.shuffleOptions,
      resultsPolicy: tests.resultsPolicy,
      releasedAt: tests.releasedAt,
      isPublished: tests.isPublished,
      createdAt: tests.createdAt,
      questionCount: sql<number>`cast(count(distinct ${testQuestions.questionId}) as int)`,
      attemptCount: sql<number>`cast(count(distinct ${attempts.id}) as int)`,
    })
    .from(tests)
    .leftJoin(testQuestions, eq(testQuestions.testId, tests.id))
    .leftJoin(attempts, eq(attempts.testId, tests.id))
    .groupBy(tests.id)
    .orderBy(desc(tests.createdAt));

  return json(allTests);
});

export const POST = withApi(async (req) => {
  const session = await apiTeacher();
  const body = await req.json().catch(() => ({}));
  const parsed = createTestSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid test settings', {
      issues: parsed.error.issues,
    });
  }

  const { opensAt, closesAt, ...rest } = parsed.data;

  const db = await getDb();
  const [created] = await db
    .insert(tests)
    .values({
      ...rest,
      opensAt: opensAt ? new Date(opensAt) : null,
      closesAt: closesAt ? new Date(closesAt) : null,
      createdBy: session.userId,
    })
    .returning();

  return json(created, 201);
});
