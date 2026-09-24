import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filesApi } from '@/services/filesApi.js';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';

function distance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * Full-screen file preview: image zoom/pinch via a plain CSS `transform`
 * (no extra dependency — mouse wheel + drag-to-pan on desktop, two-finger
 * pinch + drag on touch, double-click/tap to toggle 1x/2.5x), a PDF viewer
 * (`<iframe>` at the file's signed `url`, per docs/API.md — no extra PDF.js
 * dependency needed), and previous/next between the document's files.
 */
export default function FilePreview({ files, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  const dragState = useRef(null);
  const pinchState = useRef(null);

  useFocusTrap(panelRef, true, { onClose, closeOnEscape: true });

  const file = files[index];
  const isImage = file?.mimeType?.startsWith('image/');
  const isPdf = file?.mimeType === 'application/pdf';

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    resetZoom();
  }, [index, resetZoom]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIndex((i) => Math.min(files.length - 1, i + 1)), [files.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext]);

  const handleWheel = (e) => {
    if (!isImage) return;
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(1, s - e.deltaY * 0.0015)));
  };

  const handleDoubleClick = () => {
    setScale((s) => (s > 1 ? 1 : 2.5));
    setTranslate({ x: 0, y: 0 });
  };

  const handlePointerDown = (e) => {
    if (!isImage || scale <= 1) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, origin: translate };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setTranslate({ x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy });
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchState.current = { startDist: distance(e.touches), startScale: scale };
    }
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchState.current) {
      e.preventDefault();
      const ratio = distance(e.touches) / pinchState.current.startDist;
      setScale(Math.min(4, Math.max(1, pinchState.current.startScale * ratio)));
    }
  };
  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) pinchState.current = null;
  };

  if (!file) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={file.label || file.originalName}
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 text-white outline-none"
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-2 p-3 pt-[calc(var(--safe-top)+0.75rem)]">
        <p className="min-w-0 truncate text-sm font-medium">{file.label || file.originalName}</p>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => filesApi.triggerDownload(file.downloadUrl, file.originalName)}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="Download"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
          </button>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label="Close">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 select-none overflow-hidden touch-none"
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isImage ? (
          <img
            src={filesApi.resolveUrl(file.url)}
            alt={file.label || file.originalName}
            className="mx-auto h-full w-full object-contain"
            style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transition: dragState.current ? 'none' : 'transform 0.1s ease-out', cursor: scale > 1 ? 'grab' : 'default' }}
            draggable={false}
          />
        ) : isPdf ? (
          <iframe title={file.label || 'PDF preview'} src={filesApi.resolveUrl(file.url)} className="h-full w-full bg-white" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/70">Preview not available for this file type.</div>
        )}

        {index > 0 && (
          <button type="button" onClick={goPrev} aria-label="Previous file" className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 hover:bg-black/60">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </button>
        )}
        {index < files.length - 1 && (
          <button type="button" onClick={goNext} aria-label="Next file" className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 hover:bg-black/60">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        )}
      </div>

      <div className="flex-shrink-0 pb-[var(--safe-bottom)] pt-2 text-center text-xs text-white/60">
        {index + 1} / {files.length}
      </div>
    </div>,
    document.body,
  );
}
