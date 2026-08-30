import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Cost parameters. N=2^15 keeps a login around 100ms on this machine, which is
// the right trade for a local build: slow enough to matter, fast enough that
// seeding 14 accounts is not a coffee break.
const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 96 * 1024 * 1024;

/** Format: scrypt$N$r$p$<salt b64url>$<hash b64url> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/**
 * A real, well-formed hash of a value nobody can supply. Verifying against this
 * costs exactly as much as verifying against a genuine hash.
 *
 * `verifyPassword(pw, null)` used to return `false` immediately, which made
 * auth.ts's "still spend the time hashing so a missing user is not measurably
 * faster" defence a no-op: unknown usernames answered ~100ms sooner than known
 * ones, a trivially measurable enumeration oracle. Callers with no stored hash
 * now burn the same scrypt work before failing.
 */
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(43);

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const target = stored ?? DUMMY_HASH;
  const parts = target.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');

  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }

  // The dummy path did the work; it must still never authenticate.
  if (!stored) return false;

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
