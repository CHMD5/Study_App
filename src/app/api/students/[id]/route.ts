import { and, desc, eq, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { hashPassword } from '@/lib/password';
import { getDb } from '@/db/client';
import { attempts, profiles, tests } from '@/db/schema';

type Ctx = { params: Promise<{ id: string }> };

const UpdateStudentSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().toLowerCase().optional(),
  phone: z.string().trim().max(25).optional().nullable(),
  batch: z.string().trim().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
  canLogin: z.boolean().optional(),
  newPassword: z.string().min(4).optional(),
});

/**
 * GET /api/students/:id
 * Fetches a single student with attempt summary.
 */
export const GET = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: studentId } = await params;
  const db = await getDb();

  const [student] = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      username: profiles.username,
      email: profiles.email,
      phone: profiles.phone,
      batch: profiles.batch,
      isActive: profiles.isActive,
      canLogin: profiles.canLogin,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(and(eq(profiles.id, studentId), eq(profiles.role, 'student')));

  if (!student) {
    throw new HttpError(404, 'not_found', 'Student profile not found.');
  }

  const studentAttempts = await db
    .select({
      attemptId: attempts.id,
      testId: attempts.testId,
      testTitle: tests.title,
      attemptNo: attempts.attemptNo,
      status: attempts.status,
      totalMarks: attempts.totalMarks,
      maxMarks: attempts.maxMarks,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(tests.id, attempts.testId))
    .where(eq(attempts.studentId, studentId))
    .orderBy(desc(attempts.startedAt));

  return json({ student, attempts: studentAttempts });
});

/**
 * PATCH /api/students/:id
 * Updates student fields, batch, status, or resets password.
 */
export const PATCH = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: studentId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = UpdateStudentSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_error', 'Invalid student updates', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const db = await getDb();

  const [existing] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, studentId), eq(profiles.role, 'student')));

  if (!existing) {
    throw new HttpError(404, 'not_found', 'Student profile not found.');
  }

  const updates: Record<string, any> = {};

  if (parsed.data.fullName !== undefined) updates.fullName = parsed.data.fullName;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone ? parsed.data.phone.trim() : null;
  if (parsed.data.batch !== undefined) updates.batch = parsed.data.batch || null;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.canLogin !== undefined) updates.canLogin = parsed.data.canLogin;

  if (parsed.data.email !== undefined && parsed.data.email !== existing.email) {
    const emailConflict = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.email, parsed.data.email), ne(profiles.id, studentId)));
    if (emailConflict.length > 0) {
      throw new HttpError(409, 'email_taken', `Email "${parsed.data.email}" is already registered.`);
    }
    updates.email = parsed.data.email;
  }

  if (parsed.data.newPassword) {
    updates.passwordHash = await hashPassword(parsed.data.newPassword);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(profiles).set(updates).where(eq(profiles.id, studentId));
  }

  const [updated] = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      username: profiles.username,
      email: profiles.email,
      phone: profiles.phone,
      batch: profiles.batch,
      isActive: profiles.isActive,
      canLogin: profiles.canLogin,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, studentId));

  return json({ student: updated });
});

/**
 * DELETE /api/students/:id
 * Deletes student if no attempts exist, or deactivates if attempt history exists.
 */
export const DELETE = withApi<Ctx>(async (req, { params }) => {
  await apiTeacher();
  const { id: studentId } = await params;
  const db = await getDb();

  const [existing] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, studentId), eq(profiles.role, 'student')));

  if (!existing) {
    throw new HttpError(404, 'not_found', 'Student profile not found.');
  }

  // Check attempt history
  const [attemptCount] = await db
    .select({ count: attempts.id })
    .from(attempts)
    .where(eq(attempts.studentId, studentId))
    .limit(1);

  if (attemptCount) {
    // Preserve exam audit trail by deactivating instead of deleting
    await db
      .update(profiles)
      .set({ isActive: false, canLogin: false })
      .where(eq(profiles.id, studentId));

    return json({
      deleted: false,
      deactivated: true,
      message: 'Student has recorded exam attempts. Account was deactivated to preserve exam history.',
    });
  }

  await db.delete(profiles).where(eq(profiles.id, studentId));
  return json({ deleted: true, deactivated: false, message: 'Student deleted successfully.' });
});
