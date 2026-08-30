import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { profiles } from '@/db/schema';
import { verifyPassword } from './password';
import { getSession, issueSession, type Role, type Session } from './session';
import { HttpError } from './http';

export type { Session, Role };
export { getSession };

/**
 * Authenticate a username/password pair. Returns null for every failure mode —
 * unknown user, disabled account, data-only account with no hash, wrong password
 * — so the login screen cannot be used to enumerate which usernames exist.
 */
export async function authenticate(username: string, password: string): Promise<Session | null> {
  const db = await getDb();
  const trimmed = (username ?? '').trim();
  const [user] = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.username}) = lower(${trimmed})`)
    .limit(1);

  if (!user || !user.isActive || !user.canLogin) {
    // Still spend the time hashing, so a missing user is not measurably faster
    // than a wrong password.
    await verifyPassword(password, null);
    return null;
  }

  if (!(await verifyPassword(password, user.passwordHash))) return null;

  return {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
}

export async function login(username: string, password: string): Promise<Session | null> {
  const session = await authenticate(username, password);
  if (session) await issueSession(session);
  return session;
}

// ---------------------------------------------------------------------------
// Page guards — redirect. Use inside server components and layouts.
// ---------------------------------------------------------------------------

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireTeacher(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== 'teacher') redirect('/student');
  return session;
}

export async function requireStudent(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== 'student') redirect('/teacher');
  return session;
}

/** Where a freshly logged-in user belongs. */
export function homeFor(role: Role): string {
  return role === 'teacher' ? '/teacher' : '/student';
}

// ---------------------------------------------------------------------------
// API guards — throw HttpError. Use inside route handlers wrapped in withApi.
// ---------------------------------------------------------------------------

export async function apiSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, 'unauthenticated', 'Sign in to continue.');
  return session;
}

export async function apiTeacher(): Promise<Session> {
  const session = await apiSession();
  if (session.role !== 'teacher') {
    throw new HttpError(403, 'forbidden', 'This action requires a teacher account.');
  }
  return session;
}

export async function apiStudent(): Promise<Session> {
  const session = await apiSession();
  if (session.role !== 'student') {
    throw new HttpError(403, 'forbidden', 'This action requires a student account.');
  }
  return session;
}
