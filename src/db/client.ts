import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { MIGRATIONS_DIR, PGDATA_DIR, ensureDataDirs } from '@/lib/paths';
import { sweepExpiredAttempts } from '@/lib/sweep';
import { withDbLock } from '@/lib/db-lock';

const { Pool } = pg;

export type ClientQueryable = {
  query: <T = any>(text: string, params?: any[]) => Promise<{ rows: T[] }>;
  exec?: (sql: string) => Promise<any>;
};

export type Db = PgliteDatabase<typeof schema> & {
  $client: ClientQueryable;
};

/**
 * Global cache across Next.js dev-mode module reloads and serverless hot lambdas.
 */
const globalForDb = globalThis as unknown as {
  __vtpDb?: Promise<{ client: ClientQueryable; db: Db }>;
  __vtpSweepTimer?: NodeJS.Timeout;
  __vtpPgPool?: pg.Pool;
};

export function isExternalDb(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Dual-engine database initialization:
 * 1. If DATABASE_URL is set -> connects to production PostgreSQL connection pool (pg.Pool).
 * 2. If DATABASE_URL is unset -> boots in-process PGlite (data/pgdata) with zero configuration.
 */
async function initialise(): Promise<{ client: ClientQueryable; db: Db }> {
  if (isExternalDb()) {
    const connectionString = process.env.DATABASE_URL!;
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    const sslOption =
      process.env.DATABASE_SSL === 'false'
        ? false
        : !isLocalhost || process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined;

    const pool =
      globalForDb.__vtpPgPool ??
      new Pool({
        connectionString,
        ssl: sslOption,
        max: Number(process.env.DATABASE_POOL_MAX ?? 10),
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      });

    globalForDb.__vtpPgPool = pool;

    await runMigrations(pool);
    const db = drizzleNodePg(pool, { schema }) as Db;
    db.$client = pool;

    // In non-serverless long-running production, initialize sweep interval
    if (process.env.VERCEL !== '1' && process.env.DISABLE_SWEEP_TIMER !== 'true') {
      await sweepExpiredAttempts(db).catch((err) => console.error('[sweep] initial run failed', err));

      const SWEEP_INTERVAL_MS = 60_000;
      globalForDb.__vtpSweepTimer = setInterval(() => {
        sweepExpiredAttempts(db).catch((err) => console.error('[sweep] failed', err));
      }, SWEEP_INTERVAL_MS).unref();
    }

    return { client: pool, db };
  }

  // Fallback: Local development with embedded PGlite
  ensureDataDirs();
  const pgInstance = await PGlite.create(PGDATA_DIR);
  await runMigrations(pgInstance);
  const db = drizzlePglite(pgInstance, { schema }) as Db;
  db.$client = pgInstance;

  await sweepExpiredAttempts(db).catch((err) => console.error('[sweep] initial run failed', err));

  const SWEEP_INTERVAL_MS = 60_000;
  globalForDb.__vtpSweepTimer = setInterval(() => {
    sweepExpiredAttempts(db).catch((err) => console.error('[sweep] failed', err));
  }, SWEEP_INTERVAL_MS).unref();

  return { client: pgInstance, db };
}

/**
 * Every entry point — route handlers, server components, CLI scripts — goes
 * through here.
 */
export function getDbBundle(): Promise<{ client: ClientQueryable; db: Db }> {
  if (!globalForDb.__vtpDb) {
    globalForDb.__vtpDb = initialise().catch((err) => {
      globalForDb.__vtpDb = undefined;
      throw err;
    });
  }
  return globalForDb.__vtpDb;
}

export async function getDb(): Promise<Db> {
  const bundle = await getDbBundle();
  if (process.env.NODE_ENV !== 'production' && !isExternalDb()) {
    await runMigrations(bundle.client).catch((err) => console.error('[db] dev migration check failed', err));
  }
  return bundle.db;
}

export async function getPg(): Promise<PGlite> {
  const bundle = await getDbBundle();
  if ('dumpDataDir' in bundle.client) {
    return bundle.client as PGlite;
  }
  throw new Error('getPg() is only available when running with embedded PGlite (DATABASE_URL unset).');
}

/**
 * Minimal forward-only migrator compatible with both PGlite and PostgreSQL.
 * Applies every drizzle/NNNN_*.sql not already recorded, in filename order.
 */
export async function runMigrations(client: ClientQueryable): Promise<void> {
  return withDbLock(async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const appliedRes = await client.query<{ name: string }>('SELECT name FROM _migrations');
    const applied = new Set(appliedRes.rows.map((r) => r.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.sql'))
      .map((e) => e.name)
      .sort();

    for (const name of files) {
      if (applied.has(name)) continue;
      const sqlContent = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
      try {
        if (typeof client.exec === 'function') {
          await client.exec(sqlContent);
        } else {
          await client.query(sqlContent);
        }
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
        console.log(`[db] applied migration ${name}`);
      } catch (err) {
        throw new Error(`Migration ${name} failed: ${(err as Error).message}`, { cause: err });
      }
    }
  });
}

/** Used by scripts that need to release the database connection before exiting. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__vtpSweepTimer) {
    clearInterval(globalForDb.__vtpSweepTimer);
    globalForDb.__vtpSweepTimer = undefined;
  }
  if (!globalForDb.__vtpDb) return;
  const { client } = await globalForDb.__vtpDb;
  globalForDb.__vtpDb = undefined;
  if ('close' in client && typeof (client as any).close === 'function') {
    await (client as any).close();
  } else if ('end' in client && typeof (client as any).end === 'function') {
    await (client as any).end();
  }
  globalForDb.__vtpPgPool = undefined;
}
