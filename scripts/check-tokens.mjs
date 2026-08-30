/**
 * Fails the build if src/ references a `brand-*` / `accent-*` Tailwind step that
 * globals.css never defines.
 *
 * Tailwind v4 emits no utility at all for an undefined theme token — the class
 * lands in the HTML and does nothing. That is silent by construction, and it is
 * how ~58 usages of brand-300/400/950 and accent-200/300/700..950 came to be
 * dead across 21 files while the app looked "merely a bit washed out" in dark
 * mode. This check makes the next one a build error instead.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS = path.join(ROOT, 'src/app/globals.css');
const SRC = path.join(ROOT, 'src');

const css = fs.readFileSync(CSS, 'utf8');
const defined = new Set([...css.matchAll(/--color-(brand|accent)-(\d+)\s*:/g)].map((m) => `${m[1]}-${m[2]}`));

/** Every .ts/.tsx under src/, excluding globals.css itself. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const missing = new Map();
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\b(brand|accent)-(\d{2,3})\b/g)) {
    const token = `${m[1]}-${m[2]}`;
    if (defined.has(token)) continue;
    const rel = path.relative(ROOT, file);
    if (!missing.has(token)) missing.set(token, new Set());
    missing.get(token).add(rel);
  }
}

if (missing.size > 0) {
  console.error('\n[tokens] These palette steps are used in src/ but are not defined in globals.css.');
  console.error('[tokens] Tailwind emits nothing for them, so the styles silently do not apply.\n');
  for (const [token, files] of [...missing].sort()) {
    console.error(`  --color-${token}  →  ${[...files].sort().join(', ')}`);
  }
  console.error('');
  process.exit(1);
}

console.log(`[tokens] ok — ${defined.size} brand/accent steps defined, all references resolve.`);
