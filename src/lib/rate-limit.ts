/**
 * A fixed-window in-memory rate limiter.
 *
 * Deliberately process-local: this app is a single Node process with an
 * in-process database, so there is nowhere else for the counter to live and
 * nothing to share it with. On a multi-instance deploy this must move to the
 * database or a shared cache — the interface is small enough to swap.
 *
 * Used to put a floor under credential stuffing on /api/auth/login, where a
 * 6-character numeric password is otherwise brute-forceable in minutes.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Evict expired buckets so a long-running process doesn't accumulate keys. */
function sweep(now: number): void {
  if (buckets.size < 512) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  retryAfterS: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterS: Math.ceil(windowMs / 1000) };
  }

  existing.count += 1;
  const retryAfterS = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { ok: existing.count <= limit, remaining: Math.max(0, limit - existing.count), retryAfterS };
}

/** Clears a key's window — call after a success so a good login resets the count. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/**
 * Best-effort client identity. Behind the local dev server there is no proxy,
 * so this is usually the loopback address; the forwarded headers are honoured
 * for the reverse-proxy case.
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Test-only: drop all state between cases. */
export function __resetAllRateLimits(): void {
  buckets.clear();
}
