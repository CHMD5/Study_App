import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { DATA_DIR, ensureDataDirs } from './paths';

export const SESSION_COOKIE = 'vtp_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = 'teacher' | 'student';

export type Session = {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
};

let cachedKey: Uint8Array | undefined;

/**
 * Zero-config by design: if SESSION_SECRET is unset, generate one and persist it
 * under DATA_DIR so sessions survive a server restart. Setting SESSION_SECRET
 * explicitly makes them survive `npm run reset` too.
 */
function getKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedKey = new TextEncoder().encode(fromEnv);
    return cachedKey;
  }

  ensureDataDirs();
  const secretFile = path.join(DATA_DIR, '.session-secret');
  let secret: string;
  if (fs.existsSync(secretFile)) {
    secret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    secret = randomBytes(32).toString('base64url');
    fs.writeFileSync(secretFile, secret, { mode: 0o600 });
    console.log('[auth] generated a session secret at data/.session-secret');
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function issueSession(session: Session): Promise<void> {
  const token = await new SignJWT({
    username: session.username,
    fullName: session.fullName,
    role: session.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getKey());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    // No `secure` flag: the local build is served over plain http on localhost,
    // and a secure cookie would simply never be sent. Set it in production.
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Returns the caller's session, or null. Never throws on a bad/expired token. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getKey());
    if (!payload.sub || (payload.role !== 'teacher' && payload.role !== 'student')) return null;
    return {
      userId: payload.sub,
      username: String(payload.username ?? ''),
      fullName: String(payload.fullName ?? ''),
      role: payload.role,
    };
  } catch {
    return null;
  }
}
