import { sweepExpiredAttempts } from '@/lib/sweep';
import { HttpError, json, withApi } from '@/lib/http';

/**
 * Validates the caller against CRON_SECRET if configured in the environment.
 * Supports:
 * - Authorization: Bearer <CRON_SECRET>
 * - x-cron-secret: <CRON_SECRET>
 * - ?key=<CRON_SECRET> (convenient for webhook/cron services)
 */
function verifyCronAuth(req: Request): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return; // If unset in local dev, allow execution

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const customHeader = req.headers.get('x-cron-secret')?.trim();

  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key')?.trim();

  if (bearerToken !== secret && customHeader !== secret && queryKey !== secret) {
    throw new HttpError(401, 'unauthorized', 'Invalid or missing cron authorization secret.');
  }
}

async function handleSweep(req: Request) {
  verifyCronAuth(req);
  const closedCount = await sweepExpiredAttempts();
  return json({
    ok: true,
    closedCount,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withApi(handleSweep);
export const POST = withApi(handleSweep);
