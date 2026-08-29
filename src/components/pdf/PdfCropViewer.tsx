'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Crop, ZoomIn, ZoomOut } from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { loadPdfjs, RENDER_SCALE } from '@/lib/pdfjs';
import type { CropRect } from '@/db/schema';

/**
 * The crop tool (LLD §1.5 step 9): drag a rectangle on the rendered page,
 * get back WebP bytes plus the crop's provenance (page + rect at scale 1.0,
 * so a later re-crop can seed the same selection regardless of what zoom
 * level it's redrawn at).
 *
 * pdfjs-dist needs a raw canvas reference for pixel-accurate selection — this
 * is why the LLD specifies it directly rather than a wrapper (LLD §2).
 */
export function PdfCropViewer({
  paperId,
  totalPages,
  onCrop,
  cropping = false,
}: {
  paperId: string;
  totalPages: number | null;
  onCrop: (args: { sourcePage: number; cropRect: CropRect; blob: Blob }) => void;
  cropping?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(totalPages ?? 0);

  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Load the document once per paper.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadPdfjs()
      .then((pdfjsLib) => pdfjsLib.getDocument({ url: `/api/papers/${paperId}/pdf` }).promise)
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [paperId]);

  const renderPage = useCallback(async (pageNo: number, zoomFactor: number) => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const pdfPage = await doc.getPage(pageNo);
    const viewport = pdfPage.getViewport({ scale: RENDER_SCALE * zoomFactor });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  }, []);

  useEffect(() => {
    if (!loading) renderPage(page, zoom).catch((err) => setError(err.message));
  }, [page, zoom, loading, renderPage]);

  function onPointerDown(e: React.PointerEvent) {
    if (cropping) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrag({ x0: x, y0: y, x1: x, y1: y });
    overlayRef.current!.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    setDrag((d) => (d ? { ...d, x1: e.clientX - rect.left, y1: e.clientY - rect.top } : d));
  }

  function onPointerUp() {
    if (!drag || !canvasRef.current) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0);
    const h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);

    if (w < 8 || h < 8) return; // treat as an accidental click, not a crop

    cropSelection(x, y, w, h);
  }

  function cropSelection(x: number, y: number, w: number, h: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Overlay coordinates are CSS pixels (post-zoom); canvas backing-store
    // pixels may differ if the browser DPR scales the element, so map through
    // the canvas's own displayed-vs-backing ratio.
    const displayScaleX = canvas.width / canvas.clientWidth;
    const displayScaleY = canvas.height / canvas.clientHeight;

    const sx = x * displayScaleX;
    const sy = y * displayScaleY;
    const sw = w * displayScaleX;
    const sh = h * displayScaleY;

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const octx = out.getContext('2d');
    if (!octx) return;
    octx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    // crop_rect is stored at scale 1.0 (LLD §4.5) so it's independent of
    // whatever RENDER_SCALE/zoom produced this particular canvas.
    const renderScale = RENDER_SCALE * zoom;
    const cropRect: CropRect = {
      x: Math.round(sx / renderScale),
      y: Math.round(sy / renderScale),
      w: Math.round(sw / renderScale),
      h: Math.round(sh / renderScale),
    };

    out.toBlob(
      (blob) => {
        if (blob) onCrop({ sourcePage: page, cropRect, blob });
      },
      'image/webp',
      0.85,
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2.5 py-1.5">
        <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-slate-600">
          Page {page} / {pageCount || '…'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPage((p) => Math.min(pageCount || p, p + 1))}
          disabled={page >= pageCount}
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <div className="mx-1 h-4 w-px bg-slate-200" />
        <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
          <ZoomOut className="size-4" aria-hidden />
        </Button>
        <span className="min-w-[3rem] text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
          <ZoomIn className="size-4" aria-hidden />
        </Button>
        <div className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <Crop className="size-3.5" aria-hidden />
          Drag on the page to crop
        </div>
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
            <Spinner /> Loading PDF…
          </div>
        ) : error ? (
          <p className="p-4 text-sm text-red-600">{error}</p>
        ) : (
          <div className="relative mx-auto w-fit">
            <canvas ref={canvasRef} className="block shadow-sm" />
            <div
              ref={overlayRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              {drag ? (
                <div
                  className="absolute border-2 border-accent-500 bg-accent-400/20"
                  style={{
                    left: Math.min(drag.x0, drag.x1),
                    top: Math.min(drag.y0, drag.y1),
                    width: Math.abs(drag.x1 - drag.x0),
                    height: Math.abs(drag.y1 - drag.y0),
                  }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
