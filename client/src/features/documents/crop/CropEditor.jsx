import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Check, Maximize, RotateCcw, RotateCw, Undo2, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap.js';
import { fullQuad, isConvexQuad, rotateQuad } from './geometry.js';
import { loadBitmap, renderCrop, rotatedCanvas, turnedSize, turnQuad } from './autoCrop.js';
import Tooltip from '@/components/ui/Tooltip.jsx';

const PREVIEW_SIDE = 1400;
const HANDLE_HIT = 44; // px — the touch area of each handle
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]];

/**
 * Crop editor for one document photo, like a scanner app: the photo with the page outlined, 4
 * big corner handles and 4 edge handles to drag (44px touch areas, no pinch needed), and
 * Rotate left / Rotate right / Reset (back to the automatic result) / Use whole photo / Done.
 * Full screen on phones, a large centred panel on PC.
 *
 * Props: file (the original photo), crop ({ turns, quad, detected } — quad in the turned photo's
 * pixels, `null` = whole photo), onDone({ file, crop }), onClose()
 */
export default function CropEditor({ file, crop, onDone, onClose }) {
  const { t } = useTranslation(['documents', 'common']);
  const panelRef = useRef(null);
  const boxRef = useRef(null);
  const drag = useRef(null);
  const [src, setSrc] = useState(null);
  const [turns, setTurns] = useState(crop?.turns || 0);
  const [quad, setQuad] = useState(crop?.quad || null);
  const [preview, setPreview] = useState(null); // { url, width, height } of the turned photo
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);

  useFocusTrap(panelRef, true, { onClose, closeOnEscape: true });

  useEffect(() => {
    let alive = true;
    loadBitmap(file).then((bmp) => alive && setSrc(bmp));
    return () => { alive = false; };
  }, [file]);

  // The turned photo, small enough to show quickly.
  useEffect(() => {
    if (!src) return;
    const { canvas } = rotatedCanvas(src, turns, PREVIEW_SIDE);
    const size = turnedSize(src, turns);
    setPreview({ url: canvas.toDataURL('image/jpeg', 0.85), ...size });
  }, [src, turns]);

  // Fit the photo inside the available area.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => {
    if (!preview || !box.width) return null;
    const pad = 24; // room for the handles at the photo's edges
    const s = Math.min((box.width - pad * 2) / preview.width, (box.height - pad * 2) / preview.height);
    const w = preview.width * s;
    const h = preview.height * s;
    return { s, w, h, left: (box.width - w) / 2, top: (box.height - h) / 2 };
  }, [preview, box]);

  const shown = quad || (preview ? fullQuad(preview.width, preview.height) : null);

  const onPointerDown = (e, kind, index) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind, index, x: e.clientX, y: e.clientY, start: shown.map((p) => ({ ...p })) };
  };

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d || !fit || !preview) return;
    const dx = (e.clientX - d.x) / fit.s;
    const dy = (e.clientY - d.y) / fit.s;
    const clampX = (v) => Math.min(preview.width, Math.max(0, v));
    const clampY = (v) => Math.min(preview.height, Math.max(0, v));
    const next = d.start.map((p) => ({ ...p }));
    const moveIdx = d.kind === 'corner' ? [d.index] : EDGES[d.index];
    moveIdx.forEach((i) => { next[i] = { x: clampX(d.start[i].x + dx), y: clampY(d.start[i].y + dy) }; });
    // Never let the outline fold over itself.
    if (isConvexQuad(next)) setQuad(next);
  }, [fit, preview]);

  const onPointerUp = () => { drag.current = null; };

  const turn = (dir) => {
    if (!preview) return;
    setQuad((q) => (q ? rotateQuad(q, preview.width, preview.height, dir) : q));
    setTurns((v) => (v + dir + 4) % 4);
  };

  const reset = () => {
    setTurns(0);
    setQuad(crop?.detected || null);
  };

  const done = async () => {
    if (!src) return;
    setSaving(true);
    try {
      const whole = !quad;
      const out = await renderCrop(src, { turns, quad: whole ? null : quad }, file.name);
      onDone({ file: out, crop: { turns, quad: whole ? null : quad, detected: crop?.detected || null } });
    } finally {
      setSaving(false);
    }
  };

  const toScreen = (p) => ({ x: fit.left + p.x * fit.s, y: fit.top + p.y * fit.s });
  const pts = fit && shown ? shown.map(toScreen) : null;
  const toolBtn = 'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 text-[11px] font-medium text-white/85 hover:bg-white/10 disabled:opacity-40 sm:text-xs';

  return createPortal(
    <div className="fixed inset-0 z-[80] lg:flex lg:items-center lg:justify-center lg:bg-black/60 lg:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('crop.title', 'Adjust the crop')}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-neutral-950 text-white outline-none lg:h-[88vh] lg:max-w-4xl lg:overflow-hidden lg:rounded-2xl lg:shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[calc(var(--safe-top)+0.5rem)]">
          <Tooltip content={t('common:tip.close', 'Close')}>
            <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10" aria-label={t('common:actions.cancel', 'Cancel')}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </Tooltip>
          <p className="min-w-0 truncate text-sm font-semibold">{t('crop.title', 'Adjust the crop')}</p>
          <button
            type="button"
            onClick={done}
            disabled={!src || saving}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary-500 px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? t('crop.saving', 'Saving…') : t('crop.done', 'Done')}
          </button>
        </div>
        <p className="px-4 pb-1 text-center text-xs text-white/60">{t('crop.hint', 'Drag the corners to the edges of the document.')}</p>

        <div
          ref={boxRef}
          className="relative min-h-0 flex-1 select-none touch-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {fit && preview && (
            <img
              src={preview.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute"
              style={{ left: fit.left, top: fit.top, width: fit.w, height: fit.h }}
            />
          )}
          {pts && (
            <>
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  className="fill-black/55"
                  d={`M${fit.left} ${fit.top}h${fit.w}v${fit.h}h${-fit.w}Z M${pts.map((p) => `${p.x} ${p.y}`).join(' L')} Z`}
                />
                <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="fill-none stroke-primary-400" strokeWidth="2" />
              </svg>
              {EDGES.map(([a, b], i) => {
                const m = { x: (pts[a].x + pts[b].x) / 2, y: (pts[a].y + pts[b].y) / 2 };
                return (
                  <span
                    key={`e${i}`}
                    role="presentation"
                    onPointerDown={(e) => onPointerDown(e, 'edge', i)}
                    className="absolute flex cursor-move items-center justify-center"
                    style={{ left: m.x - HANDLE_HIT / 2, top: m.y - HANDLE_HIT / 2, width: HANDLE_HIT, height: HANDLE_HIT }}
                  >
                    <span className="h-3 w-6 rounded-full border-2 border-white bg-primary-500 shadow" style={{ transform: i % 2 ? 'rotate(90deg)' : undefined }} />
                  </span>
                );
              })}
              {pts.map((p, i) => (
                <span
                  key={`c${i}`}
                  role="slider"
                  aria-label={t('crop.corner', 'Corner {{n}}', { n: i + 1 })}
                  aria-valuetext={`${Math.round(shown[i].x)}, ${Math.round(shown[i].y)}`}
                  tabIndex={0}
                  onPointerDown={(e) => onPointerDown(e, 'corner', i)}
                  className="absolute flex cursor-grab items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
                  style={{ left: p.x - HANDLE_HIT / 2, top: p.y - HANDLE_HIT / 2, width: HANDLE_HIT, height: HANDLE_HIT }}
                >
                  <span className="h-5 w-5 rounded-full border-[3px] border-white bg-primary-500 shadow-lg" />
                </span>
              ))}
            </>
          )}
          {!preview && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">{t('crop.loading', 'Opening the photo…')}</div>
          )}
        </div>

        <div className="grid flex-shrink-0 grid-cols-4 gap-1 px-2 pb-[calc(var(--safe-bottom)+0.5rem)] pt-2">
          <Tooltip content={t('tip.rotateLeft', 'Rotate left')} className="grid">
            <button type="button" className={toolBtn} onClick={() => turn(-1)} disabled={!preview}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              {t('crop.rotateLeft', 'Rotate left')}
            </button>
          </Tooltip>
          <Tooltip content={t('tip.rotateRight', 'Rotate right')} className="grid">
            <button type="button" className={toolBtn} onClick={() => turn(1)} disabled={!preview}>
              <RotateCw className="h-5 w-5" aria-hidden="true" />
              {t('crop.rotateRight', 'Rotate right')}
            </button>
          </Tooltip>
          <Tooltip content={t('tip.resetCrop', 'Undo my changes')} className="grid">
            <button type="button" className={toolBtn} onClick={reset} disabled={!preview}>
              <Undo2 className="h-5 w-5" aria-hidden="true" />
              {t('crop.reset', 'Reset')}
            </button>
          </Tooltip>
          <Tooltip content={t('tip.wholePhoto', 'Use the whole photo')} className="grid">
            <button type="button" className={toolBtn} onClick={() => setQuad(null)} disabled={!preview || !quad}>
              <Maximize className="h-5 w-5" aria-hidden="true" />
              {t('crop.whole', 'Whole photo')}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Where the saved crop sits in the turned photo's pixels (for callers that only kept the auto result). */
export { turnQuad };
