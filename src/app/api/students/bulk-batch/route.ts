import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { getDb } from '@/db/client';
import { profiles } from '@/db/schema';

const BulkBatchSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, 'Select at least one student'),
  batch: z.string().trim().max(100).nullable(),
});

/**
 * POST /api/students/bulk-batch
 * Bulk assigns students to a target batch.
 */
export const POST = withApi(async (req) => {
  await apiTeacher();
  const body = await req.json().catch(() => ({}));
  const parsed = BulkBatchSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_error', 'Invalid batch assignment request', {
      issues: parsed.error.issues,
    });
  }

  const { studentIds, batch } = parsed.data;
  const db = await getDb();

  const res = await db
    .update(profiles)
    .set({ batch: batch || null })
    .where(and(eq(profiles.role, 'student'), inArray(profiles.id, studentIds)));

  return json({
    success: true,
    updatedCount: studentIds.length,
    batch: batch || 'General',
    message: `Updated batch for ${studentIds.length} student${studentIds.length === 1 ? '' : 's'}.`,
  });
});
