import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { apiStudent } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { attemptEvents, attempts } from '@/db/schema';
import { rateLimit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ id: string }> };

// The runner emits one event per tab focus change. A student flipping tabs
// rapidly, or a script, could otherwise append rows without limit.
const EVENT_LIMIT = 120;
const EVENT_WINDOW_MS = 60_000;

const KNOWN_EVENT_TYPES = [
  'tab_hidden',
  'tab_visible',
  'fullscreen_enter',
  'fullscreen_exit',
  'offline',
  'online',
  'paste_blocked',
] as const;

const eventSchema = z.object({
  eventType: z.enum(KNOWN_EVENT_TYPES),
  // Capped so a single event cannot carry an unbounded JSON blob into the table.
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

  // A closed attempt is an immutable historical record; nothing more gets
  // appended to its integrity timeline.
  if (attempt.status !== 'in_progress') {
    return json({ ok: true, ignored: 'attempt_closed' });
  }

  const limit = rateLimit(`events:${attemptId}`, EVENT_LIMIT, EVENT_WINDOW_MS);
  if (!limit.ok) {
    // Dropped rather than errored — this is passive telemetry and must never
    // interrupt a student mid-exam.
    return json({ ok: true, ignored: 'rate_limited' });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, 'validation_failed', 'Invalid event payload');
  }

  let meta = parsed.data.meta ?? null;
  if (meta && JSON.stringify(meta).length > 2000) {
    meta = { truncated: true };
  }

  await db.insert(attemptEvents).values({
    attemptId,
    eventType: parsed.data.eventType,
    meta,
  });

  return json({ ok: true });
});
