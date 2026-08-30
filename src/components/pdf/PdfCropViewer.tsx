'use client';

import { useEffect, useRef, useState, useCallback, useId } from 'react';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { Button, Spinner } from '@/components/ui';
import { loadPdfjs } from '@/lib/pdfjs';
import type { CropRect } from '@/db/schema';
import { cn } from '@/lib/cn';

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

interface PageDim {
  width: number;
  height: number;
}

interface DragState {
  pageNo: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface PdfCropViewerProps {
  paperId: string;
  totalPages: number | null;
  onCrop: (args: { sourcePage: number; cropRect: CropRect; blob: Blob }) => void;
  cropping?: boolean;
}

/**
 * Single PDF Page Item component.
 * Lazily renders canvas when near the viewport and handles pointer crop events.
 */
function PdfPageItem({
  doc,
  pageNo,
  scale,
  baseWidth,
  baseHeight,
  onDimensionsLoaded,
  dragState,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  cropping: _cropping,
}: {
  doc: PDFDocumentProxy;
  pageNo: number;
  scale: number;
  baseWidth: number;
  baseHeight: number;
  onDimensionsLoaded: (pageNo: number, dim: PageDim) => void;
  dragState: DragState | null;
  onStartDrag: (pageNo: number, e: React.PointerEvent, canvas: HTMLCanvasElement | null) => void;
  onMoveDrag: (e: React.PointerEvent) => void;
  onEndDrag: () => void;
  cropping?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null);
  const [pageDim, setPageDim] = useState<PageDim>({ width: baseWidth, height: baseHeight });
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);

  // Lazy render intersection observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: '600px 0px 600px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch page proxy when visible (or initial)
  useEffect(() => {
    let cancelled = false;
    if (!isVisible && pageNo > 2) return; // prefetch first 2 pages

    doc.getPage(pageNo)
      .then((p) => {
        if (cancelled) return;
        setPageProxy(p);
        const vp = p.getViewport({ scale: 1.0 });
        const dim = { width: vp.width, height: vp.height };
        setPageDim(dim);
        onDimensionsLoaded(pageNo, dim);
      })
      .catch((err) => {
        if (cancelled) return;
        setRenderError(err?.message || 'Failed to load page');
      });

    return () => {
      cancelled = true;
    };
  }, [doc, pageNo, isVisible, onDimensionsLoaded]);

  // Render canvas when pageProxy, scale or visibility updates
  useEffect(() => {
    if (!isVisible || !pageProxy || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Cancel any ongoing render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {
        // ignore
      }
      renderTaskRef.current = null;
    }

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const dpiScale = Math.min(Math.max(dpr, 1.5), 2.5);
    const viewport = pageProxy.getViewport({ scale: scale * dpiScale });

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const task = pageProxy.render({
      canvasContext: ctx,
      viewport,
    });
    renderTaskRef.current = task;

    task.promise
      .then(() => {
        renderTaskRef.current = null;
      })
      .catch((err: any) => {
        if (err?.name !== 'RenderingCancelledException') {
          console.error(`Page ${pageNo} render error:`, err);
        }
      });

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
        renderTaskRef.current = null;
      }
    };
  }, [isVisible, pageProxy, scale, pageNo]);

  const displayWidth = Math.round(pageDim.width * scale);
  const displayHeight = Math.round(pageDim.height * scale);

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNo}`}
      data-page-no={pageNo}
      className="group relative flex flex-col items-center"
      style={{
        width: `${displayWidth}px`,
        minHeight: `${displayHeight}px`,
      }}
    >
      {/* Page Number Label */}
      <div className="mb-1.5 flex items-center justify-between w-full px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 select-none">
        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 dark:bg-slate-800">
          Page {pageNo}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          {Math.round(pageDim.width)} × {Math.round(pageDim.height)} pt
        </span>
      </div>

      {/* Page Card Box */}
      <div
        className={cn(
          'relative w-full rounded-md border border-slate-300/80 bg-white shadow-md transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900',
          'overflow-hidden'
        )}
        style={{
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
        }}
      >
        {isVisible ? (
          <>
            {renderError ? (
              <div className="flex h-full items-center justify-center p-4 text-xs text-red-500">
                {renderError}
              </div>
            ) : (
              <>
                <canvas
                  ref={canvasRef}
                  className="block select-none"
                  style={{
                    width: `${displayWidth}px`,
                    height: `${displayHeight}px`,
                  }}
                />
                {/* Interactive Crop Overlay */}
                <div
                  className="absolute inset-0 cursor-crosshair touch-none select-none z-10"
                  onPointerDown={(e) => onStartDrag(pageNo, e, canvasRef.current)}
                  onPointerMove={onMoveDrag}
                  onPointerUp={onEndDrag}
                  onPointerCancel={onEndDrag}
                >
                  {dragState ? (
                    <div
                      className="absolute border-2 border-accent-500 bg-accent-400/25 pointer-events-none"
                      style={{
                        left: Math.min(dragState.x0, dragState.x1),
                        top: Math.min(dragState.y0, dragState.y1),
                        width: Math.abs(dragState.x1 - dragState.x0),
                        height: Math.abs(dragState.y1 - dragState.y0),
                      }}
                    />
                  ) : null}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-50 dark:bg-slate-900/50">
            <span className="text-xs text-slate-400 dark:text-slate-600 font-mono">
              Page {pageNo}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Enhanced PDF Viewer with Auto-Fit Responsive Zoom, Continuous Multi-Page Vertical Scroll,
 * and Multi-Page Drag-to-Crop.
 */
export function PdfCropViewer({
  paperId,
  totalPages,
  onCrop,
  cropping = false,
}: PdfCropViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const activeCanvasRef = useRef<{ pageNo: number; canvas: HTMLCanvasElement } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(totalPages ?? 0);
  const [activePage, setActivePage] = useState(1);

  // Default page dimensions (fallback to A4)
  const [basePageDim, setBasePageDim] = useState<PageDim>({ width: 595, height: 842 });
  const [pageDims, setPageDims] = useState<Record<number, PageDim>>({});

  // Container dimensions
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(0);

  // Zoom management
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [customZoom, setCustomZoom] = useState<number>(1.0);

  // Cropping drag state
  const [drag, setDrag] = useState<DragState | null>(null);

  // Track container resize
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      setContainerWidth(el.clientWidth);
      setContainerHeight(el.clientHeight);
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Load PDF Document
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadPdfjs()
      .then((pdfjsLib) => pdfjsLib.getDocument({ url: `/api/papers/${paperId}/pdf` }).promise)
      .then(async (doc) => {
        if (cancelled) return;
        docRef.current = doc;
        setPageCount(doc.numPages);

        try {
          const firstPage = await doc.getPage(1);
          const vp = firstPage.getViewport({ scale: 1.0 });
          setBasePageDim({ width: vp.width, height: vp.height });
          setPageDims((prev) => ({ ...prev, 1: { width: vp.width, height: vp.height } }));
        } catch {
          // ignore
        }
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

  // Compute effective scale based on zoomMode and container dimensions
  const effectiveScale = (() => {
    const horizontalPadding = 48; // 24px each side
    const availableW = Math.max(200, (containerWidth || 600) - horizontalPadding);
    const verticalPadding = 64;
    const availableH = Math.max(200, (containerHeight || 800) - verticalPadding);

    if (zoomMode === 'fit-width') {
      return availableW / basePageDim.width;
    }
    if (zoomMode === 'fit-page') {
      const scaleW = availableW / basePageDim.width;
      const scaleH = availableH / basePageDim.height;
      return Math.min(scaleW, scaleH);
    }
    return customZoom;
  })();

  const handleDimensionsLoaded = useCallback((pageNo: number, dim: PageDim) => {
    setPageDims((prev) => {
      if (prev[pageNo]?.width === dim.width && prev[pageNo]?.height === dim.height) {
        return prev;
      }
      return { ...prev, [pageNo]: dim };
    });
  }, []);

  // Track active page as user scrolls
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || pageCount <= 1) return;

    const containerTop = container.scrollTop;
    const containerMid = containerTop + container.clientHeight / 3;

    let closestPage = 1;
    let minDistance = Infinity;

    for (let p = 1; p <= pageCount; p++) {
      const el = document.getElementById(`pdf-page-${p}`);
      if (el) {
        const offsetTop = el.offsetTop;
        const dist = Math.abs(offsetTop - containerMid);
        if (dist < minDistance) {
          minDistance = dist;
          closestPage = p;
        }
      }
    }

    setActivePage(closestPage);
  }, [pageCount]);

  // Scroll to a specific page
  const scrollToPage = useCallback((targetPage: number) => {
    const pageNo = Math.max(1, Math.min(pageCount, targetPage));
    setActivePage(pageNo);
    const el = document.getElementById(`pdf-page-${pageNo}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [pageCount]);

  // Zoom controls
  const handleZoomIn = () => {
    setZoomMode('custom');
    setCustomZoom((_z) => Math.min(4.0, Number((effectiveScale * 1.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setCustomZoom((_z) => Math.max(0.3, Number((effectiveScale / 1.25).toFixed(2))));
  };

  const handleZoomModeSelect = (val: string) => {
    if (val === 'fit-width') {
      setZoomMode('fit-width');
    } else if (val === 'fit-page') {
      setZoomMode('fit-page');
    } else {
      setZoomMode('custom');
      setCustomZoom(parseFloat(val));
    }
  };

  // Crop Drag Handling
  const handleStartDrag = (pageNo: number, e: React.PointerEvent, canvas: HTMLCanvasElement | null) => {
    if (cropping) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    target.setPointerCapture(e.pointerId);
    if (canvas) {
      activeCanvasRef.current = { pageNo, canvas };
    }
    setDrag({ pageNo, x0: x, y0: y, x1: x, y1: y });
  };

  const handleMoveDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDrag((d) => (d ? { ...d, x1: x, y1: y } : null));
  };

  const handleEndDrag = () => {
    if (!drag) return;
    const { pageNo, x0, y0, x1, y1 } = drag;
    const x = Math.min(x0, x1);
    const y = Math.min(y0, y1);
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    setDrag(null);

    if (w < 8 || h < 8) {
      activeCanvasRef.current = null;
      return; // Treat as accidental click
    }

    const currentActive = activeCanvasRef.current;
    if (!currentActive || currentActive.pageNo !== pageNo) {
      activeCanvasRef.current = null;
      return;
    }

    const canvas = currentActive.canvas;
    activeCanvasRef.current = null;

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

    // Coordinate in unscaled base PDF points (scale 1.0)
    const cropRect: CropRect = {
      x: Math.round(x / effectiveScale),
      y: Math.round(y / effectiveScale),
      w: Math.round(w / effectiveScale),
      h: Math.round(h / effectiveScale),
    };

    out.toBlob(
      (blob) => {
        if (blob) {
          onCrop({ sourcePage: pageNo, cropRect, blob });
        }
      },
      'image/webp',
      0.88,
    );
  };

  const zoomSelectId = useId();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 select-none">
      {/* Sticky Top Toolbar */}
      <div className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-1.5 border-b border-slate-200 bg-white/95 px-3 py-1.5 shadow-xs backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        {/* Page Jump / Navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrollToPage(activePage - 1)}
            disabled={activePage <= 1}
            title="Previous Page"
            aria-label="Previous Page"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>

          <div className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={pageCount || 1}
              value={activePage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) scrollToPage(val);
              }}
              className="w-11 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-center text-xs font-semibold focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400 dark:text-slate-500">/ {pageCount || '…'}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrollToPage(activePage + 1)}
            disabled={activePage >= pageCount}
            title="Next Page"
            aria-label="Next Page"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="size-4" aria-hidden />
          </Button>

          <select
            id={zoomSelectId}
            value={zoomMode === 'custom' ? customZoom.toString() : zoomMode}
            onChange={(e) => handleZoomModeSelect(e.target.value)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/80 cursor-pointer"
            aria-label="Zoom preset"
          >
            <option value="fit-width">Fit Width</option>
            <option value="fit-page">Fit Page</option>
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1.0">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
            <option value="2.0">200%</option>
          </select>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="size-4" aria-hidden />
          </Button>

          {zoomMode !== 'fit-width' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomMode('fit-width')}
              title="Reset to Fit Width"
              aria-label="Reset to Fit Width"
              className="text-xs text-brand-600 dark:text-brand-400"
            >
              <RotateCcw className="size-3.5 mr-1" />
              Fit
            </Button>
          )}
        </div>

        {/* Right Info / Crop Tool hint */}
        <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Crop className="size-3.5 text-accent-600 dark:text-accent-400" aria-hidden />
          <span>Drag on any page to crop</span>
        </div>
      </div>

      {/* Main Continuous Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto overflow-x-auto bg-slate-200/60 p-4 dark:bg-slate-950/80"
      >
        {loading ? (
          <div className="flex h-full min-h-[300px] items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Spinner /> Loading PDF document…
          </div>
        ) : error ? (
          <div className="flex h-full min-h-[300px] items-center justify-center p-6 text-center text-sm text-red-600 dark:text-red-400">
            <p>{error}</p>
          </div>
        ) : docRef.current ? (
          <div className="flex flex-col items-center gap-6 pb-12">
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
              <PdfPageItem
                key={pageNum}
                doc={docRef.current!}
                pageNo={pageNum}
                scale={effectiveScale}
                baseWidth={pageDims[pageNum]?.width ?? basePageDim.width}
                baseHeight={pageDims[pageNum]?.height ?? basePageDim.height}
                onDimensionsLoaded={handleDimensionsLoaded}
                dragState={drag?.pageNo === pageNum ? drag : null}
                onStartDrag={handleStartDrag}
                onMoveDrag={handleMoveDrag}
                onEndDrag={handleEndDrag}
                cropping={cropping}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
