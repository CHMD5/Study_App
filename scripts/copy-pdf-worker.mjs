// pdf.js requires its worker file to be reachable as a static asset, and the
// worker version MUST exactly match the `pdfjs-dist` package version — a
// mismatch is the classic pdf.js-in-Next.js failure mode. Copying it here,
// pinned to the installed version, removes that as a manual step.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const destDir = join(root, 'public');
const dest = join(destDir, 'pdf.worker.min.mjs');

if (!existsSync(src)) {
  console.error(`[pdf-worker] not found at ${src} — did "npm install" run?`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[pdf-worker] copied to public/pdf.worker.min.mjs`);
