import { z } from 'zod';
import { login } from '@/lib/auth';
import { homeFor } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';
import { clientKey, rateLimit, resetRateLimit } from '@/lib/rate-limit';

const Body = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Two windows, both fixed. The per-username one stops a single account being
// ground down from many tabs; the per-client one stops one machine sweeping
// many usernames. Generous enough that a person fat-fingering their password
// several times in a row never notices.
const PER_USERNAME_LIMIT = 8;
const PER_USERNAME_WINDOW_MS = 5 * 60_000;
const PER_CLIENT_LIMIT = 30;
const PER_CLIENT_WINDOW_MS = 5 * 60_000;

export const POST = withApi(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Username and password are required.');
  }

  const username = parsed.data.username.trim().toLowerCase();
  const ip = clientKey(req);

  const byUser = rateLimit(`login:u:${username}`, PER_USERNAME_LIMIT, PER_USERNAME_WINDOW_MS);
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

  // A successful sign-in clears the username's window so a user who mistyped a
  // few times isn't still throttled on their next legitimate login.
  resetRateLimit(`login:u:${username}`);

  return json({ ok: true, homeUrl: homeFor(session.role) });
});
