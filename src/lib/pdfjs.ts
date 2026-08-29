export const RENDER_SCALE = 2.0;

let cached: Promise<typeof import('pdfjs-dist')> | undefined;

/**
 * pdfjs-dist must only ever load in the browser. Next.js still renders
 * 'use client' components server-side once for the initial HTML, which runs
 * module-scope code under Node — a static top-level import here would trigger
 * pdfjs-dist's "Please use the `legacy` build in Node.js environments."
 * warning on every page render, even though no PDF operation happens until a
 * useEffect runs (browser-only). Deferring the import to first actual use
 * avoids the warning entirely and matches how the module is really used: only
 * inside PdfCropViewer's client-side effect.
 */
export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!cached) {
    cached = import('pdfjs-dist').then((mod) => {
      // The worker MUST be the exact version copied by scripts/copy-pdf-worker.mjs
      // (predev/prebuild) — a version mismatch is the classic pdf.js-in-Next.js
      // failure and fails silently in some browsers.
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return mod;
    });
  }
  return cached;
}
