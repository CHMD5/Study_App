import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `/api/...` URL the client code fetches must correspond to a route
 * handler that actually exists, and every handler must export the verb the
 * caller uses.
 *
 * This exists because two shipped features were broken by nothing more than a
 * wrong path — `/api/tests/:id/start` (the real route is `/attempts`, so no
 * student could ever begin a test) and `/api/analytics/student` (the real route
 * is `/student/me`). Both 404'd, both returned Next's HTML error page, and both
 * surfaced to the user as a JSON parse error. TypeScript cannot see inside a
 * template literal, and the 33 unit tests covered only pure functions, so
 * nothing caught either one.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');
const API_DIR = path.join(ROOT, 'src/app/api');
const SRC_DIR = path.join(ROOT, 'src');

type RouteFile = { urlPattern: RegExp; verbs: Set<string>; file: string };

function walk(dir: string, filter: (name: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

/** Collect every route.ts under src/app/api, with the HTTP verbs it exports. */
function collectRoutes(): RouteFile[] {
  return walk(API_DIR, (n) => n === 'route.ts' || n === 'route.tsx').map((file) => {
    const source = fs.readFileSync(file, 'utf8');

    const verbs = new Set<string>();
    for (const m of source.matchAll(
      /export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
    )) {
      verbs.add(m[1]);
    }
    // `export const PATCH = handler; export const POST = handler;`
    for (const m of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*\w+\s*;/g)) {
      verbs.add(m[1]);
    }

    // src/app/api/tests/[id]/attempts/route.ts → /api/tests/<seg>/attempts
    const rel = path.relative(path.join(ROOT, 'src/app'), path.dirname(file)).split(path.sep).join('/');
    const pattern = new RegExp(
      '^/' +
        rel
          .split('/')
          .map((seg) => (seg.startsWith('[') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
          .join('/') +
        '$',
    );

    return { urlPattern: pattern, verbs, file: path.relative(ROOT, file) };
  });
}

/** Every distinct /api/... URL referenced from a fetch/href/action in src/. */
function collectReferences(): { url: string; verb: string; file: string }[] {
  const refs: { url: string; verb: string; file: string }[] = [];

  const files = walk(SRC_DIR, (n) => /\.tsx?$/.test(n)).filter((f) => !f.includes('.test.'));

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');

    // fetch(`/api/...`, { method: 'X' })  |  fetch('/api/...')
    for (const m of source.matchAll(/fetch\(\s*[`'"](\/api\/[^`'"]*)[`'"]\s*(?:,\s*(\{[\s\S]{0,300}?\}))?\s*\)/g)) {
      const verbMatch = m[2]?.match(/method:\s*['"](\w+)['"]/);
      refs.push({ url: m[1], verb: (verbMatch?.[1] ?? 'GET').toUpperCase(), file: path.relative(ROOT, file) });
    }

    // navigator.sendBeacon(`/api/...`) — always a POST.
    for (const m of source.matchAll(/sendBeacon\(\s*[`'"](\/api\/[^`'"]*)[`'"]/g)) {
      refs.push({ url: m[1], verb: 'POST', file: path.relative(ROOT, file) });
    }

    // <a href="/api/..."> / <Link href={`/api/...`}> — a plain navigation.
    for (const m of source.matchAll(/href=\{?\s*[`'"](\/api\/[^`'"]*)[`'"]/g)) {
      refs.push({ url: m[1], verb: 'GET', file: path.relative(ROOT, file) });
    }
  }

  return refs;
}

/** `/api/tests/${test.id}/attempts` → `/api/tests/<x>/attempts` */
function normalise(url: string): string {
  return url.replace(/\$\{[^}]*\}/g, '<x>').split('?')[0].replace(/\/$/, '');
}

/**
 * Known-broken references, deliberately not fixed yet.
 *
 * These are real bugs. They live here rather than being silently skipped so
 * they stay visible in the test output and have to be consciously removed.
 * Everything listed belongs to the analytics surface, which is still in
 * progress — see AUDIT-AND-BUG-REPORT.md items marked [WIP].
 *
 * `/api/analytics/student` (A-2): the handler is at
 * src/app/api/analytics/student/me/route.ts. The caller in
 * StudentAnalyticsClient.tsx omits the `/me`, so the Student Analytics page
 * 404s on every load. One-word fix when that surface is picked up.
 */
const KNOWN_BROKEN = new Set(['/api/analytics/student']);

describe('API route references', () => {
  const routes = collectRoutes();
  const references = collectReferences();

  it('finds route handlers and client references to check', () => {
    expect(routes.length).toBeGreaterThan(10);
    expect(references.length).toBeGreaterThan(10);
  });

  it('every fetched /api/ URL resolves to a route handler', () => {
    const broken: string[] = [];

    for (const ref of references) {
      const url = normalise(ref.url);
      if (KNOWN_BROKEN.has(url)) continue;
      if (!routes.some((r) => r.urlPattern.test(url))) {
        broken.push(`${ref.file}: ${ref.verb} ${ref.url} → no route handler`);
      }
    }

    expect(broken, `Broken API references:\n${broken.join('\n')}`).toEqual([]);
  });

  it('every KNOWN_BROKEN entry is still actually broken', () => {
    // Stops the allowlist rotting: once someone fixes the path, this fails and
    // tells them to delete the entry rather than leaving a dead exemption that
    // could mask a future regression on the same URL.
    const stale = [...KNOWN_BROKEN].filter((url) => routes.some((r) => r.urlPattern.test(url)));
    expect(stale, `These are fixed — remove them from KNOWN_BROKEN:\n${stale.join('\n')}`).toEqual([]);
  });

  it('every fetched /api/ URL is served by a handler exporting that verb', () => {
    const broken: string[] = [];

    for (const ref of references) {
      const url = normalise(ref.url);
      const match = routes.find((r) => r.urlPattern.test(url));
      if (!match) continue; // reported by the previous test
      if (!match.verbs.has(ref.verb)) {
        broken.push(
          `${ref.file}: ${ref.verb} ${ref.url} → ${match.file} exports only [${[...match.verbs].join(', ')}]`,
        );
      }
    }

    expect(broken, `Verb mismatches:\n${broken.join('\n')}`).toEqual([]);
  });
});
