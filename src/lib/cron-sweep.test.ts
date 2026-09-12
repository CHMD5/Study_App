import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { GET, POST } from '@/app/api/cron/sweep-expired/route';

describe('Cron Sweep Route Handler (/api/cron/sweep-expired)', () => {
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  it('allows access when CRON_SECRET is not configured (e.g. local dev)', async () => {
    const req = new Request('http://localhost:3000/api/cron/sweep-expired', {
      method: 'GET',
    });
    const res = await GET(req, {} as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.closedCount).toBe('number');
  });

  it('rejects access when CRON_SECRET is configured and no token is provided', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';
    const req = new Request('http://localhost:3000/api/cron/sweep-expired', {
      method: 'POST',
    });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('unauthorized');
  });

  it('authorizes with Authorization Bearer header', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';
    const req = new Request('http://localhost:3000/api/cron/sweep-expired', {
      method: 'POST',
      headers: {
        authorization: 'Bearer super-secret-cron-token',
      },
    });
    const res = await POST(req, {} as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('authorizes with query parameter key', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token';
    const req = new Request('http://localhost:3000/api/cron/sweep-expired?key=super-secret-cron-token', {
      method: 'GET',
    });
    const res = await GET(req, {} as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
