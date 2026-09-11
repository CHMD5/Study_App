import { z } from 'zod';
import { homeFor, login, loginWithPhone, normalizePhone } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { clientKey, rateLimit, resetRateLimit } from '@/lib/rate-limit';

const PhoneLoginSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  countryCode: z.string().optional().default('+91'),
});

const CredentialsLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  teacherOnly: z.boolean().optional().default(false),
});

const PER_TARGET_LIMIT = 8;
const PER_TARGET_WINDOW_MS = 5 * 60_000;
const PER_CLIENT_LIMIT = 30;
const PER_CLIENT_WINDOW_MS = 5 * 60_000;

export const POST = withApi(async (req) => {
  const body = await req.json().catch(() => ({}));
  const ip = clientKey(req);

  // Check if phone login request
  if (body && typeof body === 'object' && 'phone' in body && !('username' in body)) {
    const parsed = PhoneLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_request', 'Please enter a valid mobile number.');
    }

    const { phone, countryCode } = parsed.data;
    const { fullPhone, cleanDigits } = normalizePhone(countryCode, phone);

    const byPhone = rateLimit(`login:p:${cleanDigits}`, PER_TARGET_LIMIT, PER_TARGET_WINDOW_MS);
    const byClient = rateLimit(`login:c:${ip}`, PER_CLIENT_LIMIT, PER_CLIENT_WINDOW_MS);

    if (!byPhone.ok || !byClient.ok) {
      const retryAfterS = Math.max(byPhone.retryAfterS, byClient.retryAfterS);
      throw new HttpError(
        429,
        'too_many_attempts',
        `Too many sign-in attempts. Try again in ${Math.ceil(retryAfterS / 60)} minute(s).`,
        { retryAfterS },
      );
    }

    const session = await loginWithPhone(countryCode, phone);
    resetRateLimit(`login:p:${cleanDigits}`);

    return json({ ok: true, homeUrl: '/student', session });
  }

  // Username and password login request (Faculty portal at /SRSMA, or legacy credentials)
  const parsed = CredentialsLoginSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Username and password are required.');
  }

  const username = parsed.data.username.trim().toLowerCase();
  const byUser = rateLimit(`login:u:${username}`, PER_TARGET_LIMIT, PER_TARGET_WINDOW_MS);
  const byClient = rateLimit(`login:c:${ip}`, PER_CLIENT_LIMIT, PER_CLIENT_WINDOW_MS);

  if (!byUser.ok || !byClient.ok) {
    const retryAfterS = Math.max(byUser.retryAfterS, byClient.retryAfterS);
    throw new HttpError(
      429,
      'too_many_attempts',
      `Too many sign-in attempts. Try again in ${Math.ceil(retryAfterS / 60)} minute(s).`,
      { retryAfterS },
    );
  }

  const session = await login(parsed.data.username, parsed.data.password);
  if (!session) {
    throw new HttpError(401, 'invalid_credentials', 'Incorrect username or password.');
  }

  if (parsed.data.teacherOnly && session.role !== 'teacher') {
    throw new HttpError(
      403,
      'forbidden',
      'This portal is reserved for teachers and administrators. Students must sign in using their phone number at /login.',
    );
  }

  resetRateLimit(`login:u:${username}`);

  return json({ ok: true, homeUrl: homeFor(session.role), session });
});

