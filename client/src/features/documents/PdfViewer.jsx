import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileLock2, FileWarning, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { loadPdfjs } from './pdfjs.js';

const MIN_ZOOM = 1; // 1 = the page fills the width of the screen
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.5;
const PAGE_GAP = 12; // px between pages
// Sharp but light: phones with a 3x screen get 2x canvases (a 3x canvas of an A4 page is ~12 MB).
const MAX_PIXEL_RATIO = 2;

function distance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** One page: a sized placeholder that draws itself onto a canvas only while near the screen. */
function PdfPage({ doc, number, width, aspect, visible }) {
  const canvasRef = useRef(null);
  // The render in progress on this canvas: pdf.js refuses two renders on one canvas at once, so a
  // new one (after a zoom) waits for the cancelled one to finish.
  const running = useRef(Promise.resolve());
  const height = Math.round(width * aspect);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return undefined;
    let task = null;
    let cancelled = false;
    const previous = running.current;
    running.current = previous
      .then(() => {
        if (cancelled) return null;
        if (!visible) {
          // Far off screen: free the pixels (big PDFs on low-memory phones).
          canvas.width = 0;
          canvas.height = 0;
          return null;
        }
        return doc.getPage(number).then((page) => {
          if (cancelled) return null;
          const base = page.getViewport({ scale: 1 });
          const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          task = page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport });
          return task.promise;
        });
      })
      .catch(() => { /* cancelled or failed: the placeholder stays */ });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, width, visible]);

  return (
    <div
      data-page={number}
      className="relative mx-auto bg-white shadow-lg"
      style={{ width, height, marginBottom: PAGE_GAP }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}

/**
 * In-app PDF viewer (pdf.js), so a PDF opens right away on phones too — mobile Chrome and iOS
 * Safari don't show PDFs inside an `<iframe>`. Pages are stacked and scrolled; each page is
 * drawn only while it's on or near the screen and freed again when it's far away. Fits the
 * width by default; zoom with the − / + buttons or a two-finger pinch. "Page X of Y" follows the
 * scroll. A password-protected or broken file shows a message with a Download button.
 *
 * Props: url (signed file URL), onDownload()
 */
export default function PdfViewer({ url, onDownload }) {
  const { t } = useTranslation(['documents', 'common']);
  const scrollRef = useRef(null);
  const pagesRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | locked | error
  const [progress, setProgress] = useState(0);
  const [aspects, setAspects] = useState([]); // height / width per page
  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [visible, setVisible] = useState(() => new Set([1]));
  const [current, setCurrent] = useState(1);
  const pinch = useRef(null);

  // Open the file.
  useEffect(() => {
    let cancelled = false;
    let task = null;
    setStatus('loading');
    setProgress(0);
    setDoc(null);
    loadPdfjs()
      .then((pdfjs) => {
        if (cancelled) return null;
        // Whole-file fetch: our files are small, and it avoids range requests on signed URLs.
        task = pdfjs.getDocument({ url, isEvalSupported: false, disableRange: true, disableStream: true });
        task.onProgress = ({ loaded, total }) => total && setProgress(Math.round((loaded / total) * 100));
        return task.promise;
      })
      .then(async (pdf) => {
        if (!pdf || cancelled) return;
        // Real page shapes for the first pages; the rest assume the first page's shape until drawn.
        const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
        if (cancelled) return;
        setAspects(Array.from({ length: pdf.numPages }, () => first.height / first.width));
        setDoc(pdf);
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus(err?.name === 'PasswordException' ? 'locked' : 'error');
      });
    return () => {
      cancelled = true;
      // Destroying the loading task also frees the opened document and its worker memory.
      task?.destroy();
    };
  }, [url]);

  // Correct each page's shape once it's known (mixed portrait/landscape PDFs).
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    [...visible].forEach((n) => {
      doc.getPage(n).then((page) => {
        if (cancelled) return;
        const v = page.getViewport({ scale: 1 });
        const a = v.height / v.width;
        setAspects((prev) => (Math.abs((prev[n - 1] || 0) - a) < 0.001 ? prev : prev.map((x, i) => (i === n - 1 ? a : x))));
      });
    });
    return () => { cancelled = true; };
  }, [doc, visible]);

  // Fit to the container's width (minus a small margin), and follow rotation / resizing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const measure = () => setFitWidth(Math.max(200, Math.min(el.clientWidth - 16, 1000)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const width = Math.round(fitWidth * zoom);

  // Draw only the pages on or near the screen.
  useEffect(() => {
    const root = scrollRef.current;
    const holder = pagesRef.current;
    if (!root || !holder || status !== 'ready') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          entries.forEach((e) => {
            const n = Number(e.target.dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          });
          return next.size === prev.size && [...next].every((n) => prev.has(n)) ? prev : next;
        });
      },
      { root, rootMargin: '150% 0px' },
    );
    holder.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [status, aspects.length, width]);

  // "Page X of Y": the page crossing the middle of the screen.
  const onScroll = useCallback(() => {
    const root = scrollRef.current;
    const holder = pagesRef.current;
    if (!root || !holder) return;
    const middle = root.getBoundingClientRect().top + root.clientHeight / 2;
    for (const el of holder.querySelectorAll('[data-page]')) {
      const r = el.getBoundingClientRect();
      if (r.bottom + PAGE_GAP >= middle) {
        setCurrent(Number(el.dataset.page));
        break;
      }
    }
  }, []);

  const changeZoom = (next) => {
    const root = scrollRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (!root || clamped === zoom) return;
    // Keep the same spot of the document in view.
    const ratio = clamped / zoom;
    const top = root.scrollTop;
    setZoom(clamped);
    requestAnimationFrame(() => { root.scrollTop = top * ratio; });
  };

  // Two-finger pinch: scale the pages visually while pinching, redraw sharp on release.
  const onTouchStart = (e) => {
    if (e.touches.length === 2) pinch.current = { start: distance(e.touches), scale: 1 };
  };
  const onTouchMove = (e) => {
    // No preventDefault needed: `touch-action: pan-x pan-y` already turns off the browser's own pinch.
    if (e.touches.length !== 2 || !pinch.current) return;
    pinch.current.scale = distance(e.touches) / pinch.current.start;
    const s = Math.min(MAX_ZOOM / zoom, Math.max(MIN_ZOOM / zoom, pinch.current.scale));
    if (pagesRef.current) pagesRef.current.style.transform = `scale(${s})`;
  };
  const onTouchEnd = (e) => {
    if (!pinch.current || e.touches.length >= 2) return;
    const { scale } = pinch.current;
    pinch.current = null;
    if (pagesRef.current) pagesRef.current.style.transform = '';
    changeZoom(zoom * scale);
  };

  if (status === 'locked' || status === 'error') {
    const locked = status === 'locked';
    const Icon = locked ? FileLock2 : FileWarning;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-14 text-center">
        <Icon className="h-12 w-12 text-white/70" strokeWidth={1.5} aria-hidden="true" />
        <p className="max-w-xs text-sm text-white/80">
          {locked
            ? t('filePreview.pdfLocked', 'This PDF has a password, so it can’t be shown here. Download it and open it with its password.')
            : t('filePreview.pdfFailed', 'This PDF could not be shown here.')}
        </p>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-900 hover:bg-white/90"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('filePreview.downloadInstead', 'Download instead')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="flex-1 overflow-auto overscroll-contain pt-2 [touch-action:pan-x_pan-y]"
      >
        {status === 'loading' ? (
          // A page-shaped placeholder while the file downloads.
          <div className="mx-auto flex aspect-[1/1.414] w-[calc(100%-16px)] max-w-[1000px] flex-col gap-3 bg-white/95 p-6" aria-busy="true">
            <span className="sr-only">{t('filePreview.pdfLoading', 'Opening the PDF…')}</span>
            <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-200" />
            <div className="h-3 w-full animate-pulse rounded bg-neutral-200" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-200" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-200" />
            {progress > 0 && progress < 100 && (
              <p className="mt-auto text-center text-xs text-neutral-500">{progress}%</p>
            )}
          </div>
        ) : (
          <div ref={pagesRef} className="origin-top" style={{ width: Math.max(width + 16, 0), margin: '0 auto' }}>
            {width > 0 &&
              aspects.map((aspect, i) => (
                <PdfPage key={i + 1} doc={doc} number={i + 1} width={width} aspect={aspect} visible={visible.has(i + 1)} />
              ))}
          </div>
        )}
      </div>

      {status === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-neutral-900/85 px-2 py-1 text-white shadow-lg ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => changeZoom(zoom - ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
              aria-label={t('filePreview.zoomOut', 'Zoom out')}
            >
              <ZoomOut className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="min-w-24 px-1 text-center text-xs tabular-nums" aria-live="polite">
              {t('filePreview.pageOf', 'Page {{page}} of {{total}}', { page: current, total: aspects.length })}
            </span>
            <button
              type="button"
              onClick={() => changeZoom(zoom + ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
              aria-label={t('filePreview.zoomIn', 'Zoom in')}
            >
              <ZoomIn className="h-5 w-5" aria-hidden="true" />
            </button>
            {zoom > MIN_ZOOM && (
              <button
                type="button"
                onClick={() => changeZoom(MIN_ZOOM)}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10"
                aria-label={t('filePreview.fitWidth', 'Fit to screen width')}
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
