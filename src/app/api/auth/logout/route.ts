import { clearSession } from '@/lib/session';
import { json, withApi } from '@/lib/http';

export const POST = withApi(async () => {
  await clearSession();
  return json({ ok: true });
});
