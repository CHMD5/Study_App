import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { MIGRATIONS_DIR, PGDATA_DIR, ensureDataDirs } from '@/lib/paths';
import { sweepExpiredAttempts } from '@/lib/sweep';

export type Db = PgliteDatabase<typeof schema> & { $client: PGlite };

/**
 * PGlite is an in-process Postgres. There must be exactly one instance per
 * process, and it must survive Next's dev-mode module reloading — a second
 * instance pointed at the same data directory will fail to acquire the lock.
 */
const globalForDb = globalThis as unknown as {
  __vtpDb?: Promise<{ pg: PGlite; db: Db }>;
  __vtpSweepTimer?: NodeJS.Timeout;
};

/**
 * This module is deliberately NOT wired up through instrumentation.ts. An
 * earlier version used instrumentation.ts's register() to open the database
 * and start the sweep interval at boot, which requires Next to compile an
 * instrumentation bundle for BOTH the nodejs and edge runtimes — and in dev
 * mode (no dead-code elimination pass) webpack still tries to resolve this
 * file's `node:fs`/`node:path` imports for the edge bundle, which fails with
 * "UnhandledSchemeError: node:fs". Route handlers and server components are
 * nodejs-runtime by default, so as long as this module is only ever reached
 * from there — never from instrumentation.ts — no edge bundle is built for it
 * at all. Initialisation happens lazily on the first real request instead of
 * eagerly at boot; the trade-off is the first request pays the migration
 * cost, which is milliseconds for this schema.
 */
async function initialise(): Promise<{ pg: PGlite; db: Db }> {
  ensureDataDirs();
  const pg = await PGlite.create(PGDATA_DIR);
  await runMigrations(pg);
  const db = drizzle(pg, { schema }) as Db;

  // Substitutes Vercel Cron's sweep-expired-attempts job (LLD §7.1). Started
  // exactly once per process, right after the DB that it queries becomes
  // ready — getDbBundle()'s memoisation guarantees initialise() itself only
  // ever runs once, so this can't accidentally start a second interval.
  //
  // The very first sweep is explicitly awaited, NOT fire-and-forget, and is
  // handed `db` directly rather than letting it call the default `getDb()`.
  // PGlite is a single in-process instance with no true query concurrency:
  // two Drizzle-prepared queries dispatched without one awaiting the other's
  // completion can both hit the WASM module at once and crash it outright
  // (observed directly — a fire-and-forget sweep here racing the caller's very
  // next query threw `RuntimeError: null function or function signature
  // mismatch`, reproducibly, even against a freshly migrated database with
  // nothing else going on). Awaiting it guarantees the sweep fully completes
  // before initialise() returns and before any caller can issue another
  // query. Passing `db` explicitly avoids a second, self-inflicted bug this
  // fix's first attempt introduced: sweepExpiredAttempts()'s default fallback
  // calls getDb(), which re-enters this exact still-pending promise — a
  // promise awaiting its own resolution, which deadlocks silently forever.
  await sweepExpiredAttempts(db).catch((err) => console.error('[sweep] initial run failed', err));

  const SWEEP_INTERVAL_MS = 60_000;
  // `.unref()` so this timer never by itself keeps the process alive. The real
  // dev/prod server stays up because of its HTTP listener regardless — but a
  // one-off CLI script (seed, backup, restore) that only ever calls getDb()
  // has nothing else in the event loop, and without unref() it would finish
  // all its work and then hang forever instead of exiting. Also stashed on the
  // global cache so an explicit closeDb() can clear it deterministically.
  //
  // The interval callback used to be fire-and-forget relative to whatever
  // request handler might be mid-query when it fired — the same crash risk as
  // the boot-time race above, just a narrower window. sweepExpiredAttempts now
  // takes the db lock (src/lib/db-lock.ts), as does every transaction, so the
  // sweep can no longer interleave with either.
  globalForDb.__vtpSweepTimer = setInterval(() => {
    sweepExpiredAttempts().catch((err) => console.error('[sweep] failed', err));
  }, SWEEP_INTERVAL_MS).unref();

  return { pg, db };
}

/**
 * Every entry point — route handlers, server components, CLI scripts — goes
 * through here. Initialisation (open + migrate) is memoised as a promise rather
 * than a value so concurrent first-callers await the same work instead of
 * racing to migrate twice.
 */
export function getDbBundle(): Promise<{ pg: PGlite; db: Db }> {
  if (!globalForDb.__vtpDb) {
    globalForDb.__vtpDb = initialise().catch((err) => {
      // Don't cache a failed init — otherwise a transient startup error makes
      // every later request fail with the same stale rejection.
      globalForDb.__vtpDb = undefined;
      throw err;
    });
  }
  return globalForDb.__vtpDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbBundle()).db;
}

export async function getPg(): Promise<PGlite> {
  return (await getDbBundle()).pg;
}

/**
 * Minimal forward-only migrator.
 *
 * Applies every `drizzle/NNNN_*.sql` not already recorded, in filename order.
 * `pg.exec()` uses the simple query protocol, so each file runs inside one
 * implicit transaction — a file either lands whole or not at all — and
 * dollar-quoted plpgsql bodies are parsed by the server, not split client-side.
 *
 * `drizzle/production-only/` is skipped by construction: only files directly in
 * drizzle/ are read. That is what keeps 9999_rls.sql out of the local database.
 */
async function runMigrations(pg: PGlite): Promise<void> {
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pg.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort();

  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    try {
      await pg.exec(sql);
      await pg.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
      console.log(`[db] applied migration ${name}`);
    } catch (err) {
      throw new Error(`Migration ${name} failed: ${(err as Error).message}`);
    }
  }
}

/** Used by scripts that need to release the data-directory lock before exiting. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__vtpSweepTimer) {
    clearInterval(globalForDb.__vtpSweepTimer);
    globalForDb.__vtpSweepTimer = undefined;
  }
  if (!globalForDb.__vtpDb) return;
  const { pg } = await globalForDb.__vtpDb;
  globalForDb.__vtpDb = undefined;
  await pg.close();
}
