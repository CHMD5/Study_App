import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiStudent } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptEvents, attempts } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

const eventSchema = z.object({
  eventType: z.string().min(1).max(100),
  meta: z.record(z.any()).optional().nullable(),
});

export const POST = withApi<Ctx>(async (req, { params }) => {
  const session = await apiStudent();
  const { id: attemptId } = await params;
  const db = await getDb();

  const [attempt] = await db.select().from(attempts).where(eq(attempts.id, attemptId));
  if (!attempt) throw new HttpError(404, 'not_found', 'Attempt not found');
  if (attempt.studentId !== session.userId) {
    throw new HttpError(403, 'forbidden', 'You cannot log events for another student’s attempt.');
  }

  const body = await req.json().catch(() => ({}));
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid event payload');
  }

  await db.insert(attemptEvents).values({
    attemptId,
    eventType: parsed.data.eventType,
    meta: parsed.data.meta ?? null,
  });

  return json({ ok: true });
});
