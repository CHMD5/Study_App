import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

/**
 * Regression cover for A-14: the login timing side-channel.
 *
 * auth.ts calls `verifyPassword(password, null)` for an unknown or disabled
 * account specifically so a missing user costs the same as a wrong password.
 * verifyPassword used to `return false` immediately on a null hash, making that
 * defence a no-op: unknown usernames answered ~100ms sooner than known ones,
 * which is a trivially measurable enumeration oracle.
 */
describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse');
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
  });

  it('never authenticates against a null hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('', null)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$2$3')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$32768$8$1$aaaa$bbbb')).toBe(false);
  });

  it('spends comparable time on a null hash as on a real one', async () => {
    const hash = await hashPassword('correct horse');

    // Warm up, so the first scrypt call's setup cost doesn't skew the sample.
    await verifyPassword('warmup', hash);
    await verifyPassword('warmup', null);

    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };

    const real = await time(() => verifyPassword('wrong horse', hash));
    const missing = await time(() => verifyPassword('wrong horse', null));

    // Generous bound — this asserts "the work happens at all", not a precise
    // constant-time guarantee. Before the fix the null path was ~0ms against
    // ~100ms, i.e. orders of magnitude apart, which this catches easily.
    expect(missing).toBeGreaterThan(real * 0.25);
  });
});
