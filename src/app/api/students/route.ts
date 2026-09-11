import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { apiTeacher } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { hashPassword } from '@/lib/password';
import { getDb } from '@/db/client';
import { profiles } from '@/db/schema';

const CreateStudentSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  username: z
    .string()
    .trim()
    .min(2, 'Username must be at least 2 characters')
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username can only contain letters, numbers, hyphens, periods, and underscores'),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  phone: z.string().trim().max(25).optional().nullable(),
  batch: z.string().trim().max(100).optional().nullable(),
  password: z.string().min(4, 'Password must be at least 4 characters').default('112345'),
});

/**
 * GET /api/students
 * Lists students with pagination, search, batch filter, and attempt aggregates.
 */
export const GET = withApi(async (req) => {
  await apiTeacher();
  const url = new URL(req.url);

  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 25)));
  const search = url.searchParams.get('search')?.trim() ?? '';
  const batch = url.searchParams.get('batch')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? 'all';

  const db = await getDb();

  const conditions = [eq(profiles.role, 'student')];

  if (search) {
    conditions.push(
      or(
        ilike(profiles.fullName, `%${search}%`),
        ilike(profiles.username, `%${search}%`),
        ilike(profiles.email, `%${search}%`),
        ilike(profiles.phone, `%${search}%`),
      )!,
    );
  }

  if (batch) {
    if (batch === 'General') {
      conditions.push(sql`(${profiles.batch} IS NULL OR ${profiles.batch} = 'General')`);
    } else {
      conditions.push(eq(profiles.batch, batch));
    }
  }

  if (status === 'active') {
    conditions.push(eq(profiles.isActive, true));
  } else if (status === 'inactive') {
    conditions.push(eq(profiles.isActive, false));
  }

  const whereClause = and(...conditions);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(profiles)
    .where(whereClause);

  const total = Number(count);
  const offset = (page - 1) * pageSize;

  // Student details joined with aggregated attempt stats
  const studentsQuery = await db.$client.query<{
    id: string;
    full_name: string;
    username: string;
    email: string;
    phone: string | null;
    batch: string | null;
    is_active: boolean;
    can_login: boolean;
    created_at: string;
    tests_taken: number;
    avg_score: number | null;
    avg_percentile: number | null;
    last_attempt_at: string | null;
  }>(
    `SELECT
       p.id,
       p.full_name,
       p.username,
       p.email,
       p.phone,
       p.batch,
       p.is_active,
       p.can_login,
       p.created_at,
       COUNT(a.id) FILTER (WHERE a.status <> 'in_progress') AS tests_taken,
       ROUND(AVG(a.total_marks) FILTER (WHERE a.status <> 'in_progress')::numeric, 1) AS avg_score,
       ROUND(AVG(r.percentile)::numeric, 1) AS avg_percentile,
       MAX(a.submitted_at) AS last_attempt_at
     FROM profiles p
     LEFT JOIN attempts a ON a.student_id = p.id
     LEFT JOIN v_test_ranks r ON r.test_id = a.test_id AND r.student_id = a.student_id AND r.attempt_no = a.attempt_no
     WHERE p.role = 'student'
       ${search ? `AND (p.full_name ILIKE $3 OR p.username ILIKE $3 OR p.email ILIKE $3 OR p.phone ILIKE $3)` : ''}
       ${batch ? (batch === 'General' ? `AND (p.batch IS NULL OR p.batch = 'General')` : `AND p.batch = $4`) : ''}
       ${status === 'active' ? `AND p.is_active = true` : status === 'inactive' ? `AND p.is_active = false` : ''}
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT $1 OFFSET $2`,
    search && batch && batch !== 'General'
      ? [pageSize, offset, `%${search}%`, batch]
      : search
        ? [pageSize, offset, `%${search}%`]
        : batch && batch !== 'General'
          ? [pageSize, offset, batch]
          : [pageSize, offset],
  );

  const students = studentsQuery.rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    username: r.username,
    email: r.email,
    phone: r.phone ?? null,
    batch: r.batch ?? 'General',
    isActive: r.is_active,
    canLogin: r.can_login,
    createdAt: r.created_at,
    testsTaken: Number(r.tests_taken ?? 0),
    avgScore: r.avg_score !== null ? Number(r.avg_score) : 0,
    avgPercentile: r.avg_percentile !== null ? Number(r.avg_percentile) : null,
    lastAttemptAt: r.last_attempt_at,
  }));

  return json({
    students,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * POST /api/students
 * Creates a single student account.
 */
export const POST = withApi(async (req) => {
  await apiTeacher();
  const body = await req.json().catch(() => ({}));
  const parsed = CreateStudentSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(422, 'validation_error', 'Invalid student details', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { fullName, username, email, phone, batch, password } = parsed.data;
  const db = await getDb();

  // Check unique username & email
  const existing = await db
    .select({ id: profiles.id, username: profiles.username, email: profiles.email })
    .from(profiles)
    .where(or(eq(profiles.username, username), eq(profiles.email, email)));

  if (existing.length > 0) {
    if (existing.some((e) => e.username.toLowerCase() === username.toLowerCase())) {
      throw new HttpError(409, 'username_taken', `Username "${username}" is already in use.`);
    }
    throw new HttpError(409, 'email_taken', `Email "${email}" is already registered.`);
  }

  const passwordHash = await hashPassword(password);

  const [student] = await db
    .insert(profiles)
    .values({
      role: 'student',
      fullName,
      username,
      email,
      phone: phone ? phone.trim() : null,
      batch: batch || null,
      passwordHash,
      isActive: true,
      canLogin: true,
    })
    .returning({
      id: profiles.id,
      fullName: profiles.fullName,
      username: profiles.username,
      email: profiles.email,
      phone: profiles.phone,
      batch: profiles.batch,
      isActive: profiles.isActive,
      canLogin: profiles.canLogin,
      createdAt: profiles.createdAt,
    });

  return json({ student }, 201);
});
