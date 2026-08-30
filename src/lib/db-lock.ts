/**
 * A promise-chain mutex for the single PGlite instance.
 *
 * PGlite is one in-process WASM Postgres with no real query concurrency. Two
 * queries dispatched without one awaiting the other can both reach the WASM
 * module at once and crash it outright — `RuntimeError: null function or
 * function signature mismatch`, reproducibly (see the note in db/client.ts,
 * where it was first hit by a fire-and-forget sweep racing the caller's next
 * query).
 *
 * The two places that genuinely interleave are:
 *   1. the 60s background sweep firing while a request handler is mid-query, and
 *   2. a `db.transaction()` block, which holds state across several awaits and
 *      must not have an unrelated query land in the middle of it.
 *
 * Both now take this lock. It is intentionally not wrapped around every single
 * query: a Proxy over Drizzle's lazy thenable builders is easy to get subtly
 * wrong, and serialising the two interleaving sources removes the observed
 * failure without that risk.
 */

let tail: Promise<unknown> = Promise.resolve();

/** Runs `fn` once every previously-queued task has settled. */
export function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  // Chain off a swallowed copy so one caller's rejection can't poison the queue.
  const run = tail.then(fn, fn);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
