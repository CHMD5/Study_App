import { redirect } from 'next/navigation';
import { sql } from 'drizzle-orm';
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
    // than a wrong password. verifyPassword falls back to a real dummy hash for
    // a null `stored`, so this genuinely runs scrypt rather than returning early.
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

/**
 * Normalizes country code and phone number into standard international format (+91XXXXXXXXXX)
 * and extracted local digits.
 */
export function normalizePhone(
  countryCode: string,
  rawPhone: string,
): { fullPhone: string; cleanDigits: string; countryCode: string } {
  const code = (countryCode || '+91').trim().replace(/^[^\d+]+/, '');
  const prefix = code.startsWith('+') ? code : `+${code}`;
  const codeDigits = prefix.replace(/\D/g, '');

  let digits = (rawPhone || '').replace(/\D/g, '');

  // If user included the country code in the phone input as well, strip leading match
  if (digits.startsWith(codeDigits) && digits.length > codeDigits.length + 6) {
    digits = digits.slice(codeDigits.length);
  }

  const fullPhone = `${prefix}${digits}`;
  return { fullPhone, cleanDigits: digits, countryCode: prefix };
}

/**
 * Authenticate or auto-provision a student using their phone number and country code.
 * Students do not require a username or password.
 */
export async function loginWithPhone(
  countryCode: string,
  rawPhone: string,
): Promise<Session> {
  const { fullPhone, cleanDigits } = normalizePhone(countryCode, rawPhone);

  if (cleanDigits.length < 7 || cleanDigits.length > 15) {
    throw new HttpError(400, 'invalid_phone', 'Please enter a valid mobile number (7 to 15 digits).');
  }

  const db = await getDb();

  // Look for existing profile matching phone (full phone, clean digits) or demo student fallback
  const matches = await db
    .select()
    .from(profiles)
    .where(
      sql`${profiles.phone} = ${fullPhone} OR ${profiles.phone} = ${cleanDigits} OR ${profiles.phone} = ${'+' + cleanDigits} OR (${cleanDigits} = '9876543210' AND lower(${profiles.username}) = 'student')`,
    )
    .limit(1);

  let user = matches[0];

  if (user) {
    if (!user.isActive || !user.canLogin) {
      throw new HttpError(403, 'account_disabled', 'Your account has been deactivated. Please contact your administrator.');
    }
    if (user.role !== 'student') {
      throw new HttpError(403, 'teacher_portal_required', 'This phone number belongs to a faculty account. Please sign in via the faculty portal at /SRSMA.');
    }

    // Keep phone populated if it was matched via demo fallback
    if (!user.phone) {
      await db.update(profiles).set({ phone: fullPhone }).where(sql`${profiles.id} = ${user.id}`);
    }
  } else {
    // Auto-provision a new student account so students can begin immediately
    const fullName = `Student ${cleanDigits.slice(-4)}`;
    let username = `student_${cleanDigits}`;
    let email = `${cleanDigits}@student.srsma.local`;

    // Ensure username uniqueness
    const [clash] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(sql`lower(${profiles.username}) = lower(${username})`)
      .limit(1);

    if (clash) {
      username = `student_${cleanDigits}_${Date.now().toString().slice(-4)}`;
      email = `${cleanDigits}_${Date.now().toString().slice(-4)}@student.srsma.local`;
    }

    const [created] = await db
      .insert(profiles)
      .values({
        role: 'student',
        fullName,
        username,
        email,
        phone: fullPhone,
        batch: 'General',
        isActive: true,
        canLogin: true,
      })
      .returning();

    user = created;
  }

  const session: Session = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };

  await issueSession(session);
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
  const session = await getSession();
  if (!session) redirect('/SRSMA');
  if (session.role !== 'teacher') redirect('/student');
  return session;
}

export async function requireStudent(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
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
