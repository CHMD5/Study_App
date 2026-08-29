import { z } from 'zod';
import { login } from '@/lib/auth';
import { homeFor } from '@/lib/auth';
import { HttpError, json, withApi } from '@/lib/http';

const Body = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const POST = withApi(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_request', 'Username and password are required.');
  }

  const session = await login(parsed.data.username, parsed.data.password);
  if (!session) {
    throw new HttpError(401, 'invalid_credentials', 'Incorrect username or password.');
  }

  return json({ ok: true, homeUrl: homeFor(session.role) });
});
