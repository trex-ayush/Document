/**
 * Tooltip — a small label that appears when you hover (or keyboard-focus) a control.
 *
 * Ported from the starter pack's `apps/component/src/components/ptm/Tooltip.tsx` (types stripped,
 * behaviour kept): portal-rendered, clamped to the viewport, an arrow that always points at the
 * trigger, hidden on route change and when the trigger leaves the DOM, `onlyWhenOverflow` for
 * truncated text, and a show delay. Restyled to our design standard: a dark neutral bubble in light
 * mode and a light one in dark mode, `text-xs`, `rounded-md`, 240px max width.
 * Dropped from the source: the `isTable` rich-table mode (unused here). Added: it flips to the other
 * side when there is no room, and hides on scroll and on Escape.
 *
 * Hover-only: on touch devices (no `(hover: hover)`) a tap never shows it, so a phone tap on a
 * ⋮ button just opens the menu. That is why icon-only buttons must keep their `aria-label` —
 * it is what screen readers and phones get. The bubble has `pointer-events-none`, so it never
 * blocks a click; the trigger wrapper hides it on mousedown/click.
 *
 * Props:
 *   content          — text shown in the bubble. Falsy = never shows (the wrapper stays, so the
 *                      child is not remounted and keeps focus when the text comes and goes).
 *   position         — 'top' | 'bottom' | 'left' | 'right' (default 'top')
 *   delay            — ms before showing on hover (default 60: feels instant, but no flicker when
 *                      the mouse just passes over a row of buttons; 0 = truly instant)
 *   className        — classes for the trigger wrapper (default `inline-flex items-center`).
 *                      For a truncated title use a block/min-w-0 wrapper, e.g. `min-w-0 flex`.
 *   maxWidth         — cap in px (default 240)
 *   onlyWhenOverflow — only show when the wrapped element's text is cut off (truncate/line-clamp)
 *   interactive      — keep open while the pointer is over the bubble (links inside it)
 *
 * @example
 * <Tooltip content={t('common:actions.moreOptions', 'More options')}>
 *   <Button size="icon" variant="ghost" aria-label={t('common:actions.moreOptions', 'More options')}>
 *     <MoreVertical className="h-4 w-4" />
 *   </Button>
 * </Tooltip>
 * <Tooltip content={name} onlyWhenOverflow className="flex min-w-0">
 *   <p className="truncate">{name}</p>
 * </Tooltip>
 */
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

const DEFAULT_MAX_WIDTH = 240;
const GAP = 8; // trigger → bubble distance, leaves room for the arrow
const EDGE = 8; // keep this far from the viewport edges

// A tooltip is a hover affordance. On touch devices a tap fires a simulated mouseenter + focus,
// so gate showing on real hover capability. Falls open when matchMedia is missing.
const canHover = () =>
  typeof window === 'undefined' ||
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(hover: hover)').matches;

// useLocation throws outside a router; a tooltip in a stray tree (tests, portals) should still work.
function useSafePathname() {
  try {
    return useLocation().pathname;
  } catch {
    return null;
  }
}

const ARROW_SIDE = {
  top: 'bottom-0 translate-y-1/2 -translate-x-1/2',
  bottom: 'top-0 -translate-y-1/2 -translate-x-1/2',
  left: 'right-0 translate-x-1/2 -translate-y-1/2',
  right: 'left-0 -translate-x-1/2 -translate-y-1/2',
};

export default function Tooltip({
  children,
  content,
  position = 'top',
  delay = 60,
  className,
  maxWidth: maxWidthProp,
  onlyWhenOverflow = false,
  interactive = false,
}) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: -9999, left: -9999 });
  const [arrowOffset, setArrowOffset] = useState(null);
  const hardCap = maxWidthProp ?? DEFAULT_MAX_WIDTH;
  const [maxWidth, setMaxWidth] = useState(hardCap);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timeoutRef = useRef(undefined);
  const hideTimerRef = useRef(undefined);

  // A display:contents wrapper has a zero-width box — measure its first child instead.
  const getMeasureEl = () => {
    const el = triggerRef.current;
    if (!el) return null;
    if (el.getBoundingClientRect().width === 0 && el.firstElementChild) return el.firstElementChild;
    return el;
  };

  const cancelHide = () => clearTimeout(hideTimerRef.current);

  const show = () => {
    if (!canHover() || !content) return;
    cancelHide();
    if (onlyWhenOverflow && triggerRef.current) {
      const textEl = triggerRef.current.firstElementChild;
      if (textEl) {
        const truncated =
          textEl.scrollWidth - textEl.clientWidth > 2 || textEl.scrollHeight - textEl.clientHeight > 2;
        if (!truncated) return;
      }
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(hideTimerRef.current);
    setVisible(false);
    // Reset so the next show re-measures before it becomes visible (no flash at the old spot).
    setCoords({ top: -9999, left: -9999 });
    setArrowOffset(null);
  }, []);

  const scheduleHide = () => {
    if (!interactive) {
      hide();
      return;
    }
    clearTimeout(timeoutRef.current);
    cancelHide();
    hideTimerRef.current = setTimeout(hide, 120);
  };

  // Measure and place before paint so the bubble never flashes in the wrong spot.
  useLayoutEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;
    const measureEl = getMeasureEl();
    if (!measureEl) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Never wider than the viewport: cap, then re-run once the wrapped size is known.
    const safeCap = Math.min(hardCap, vw - EDGE * 2);
    if (safeCap !== maxWidth) {
      setMaxWidth(safeCap);
      return;
    }

    const t = measureEl.getBoundingClientRect();
    // offset* (layout size) ignores the pop-in scale transform.
    const w = tooltipRef.current.offsetWidth;
    const h = tooltipRef.current.offsetHeight;

    let side = position;
    // Flip to the other side when there is no room (e.g. a navbar button near the top).
    if (side === 'top' && t.top - h - GAP < EDGE && t.bottom + h + GAP <= vh - EDGE) side = 'bottom';
    else if (side === 'bottom' && t.bottom + h + GAP > vh - EDGE && t.top - h - GAP >= EDGE) side = 'top';
    else if (side === 'left' && t.left - w - GAP < EDGE && t.right + w + GAP <= vw - EDGE) side = 'right';
    else if (side === 'right' && t.right + w + GAP > vw - EDGE && t.left - w - GAP >= EDGE) side = 'left';

    let top = 0;
    let left = 0;
    if (side === 'top') {
      top = t.top - h - GAP;
      left = t.left + t.width / 2 - w / 2;
    } else if (side === 'bottom') {
      top = t.bottom + GAP;
      left = t.left + t.width / 2 - w / 2;
    } else if (side === 'left') {
      top = t.top + t.height / 2 - h / 2;
      left = t.left - w - GAP;
    } else {
      top = t.top + t.height / 2 - h / 2;
      left = t.right + GAP;
    }

    // Clamp right before left so a too-wide bubble ends flush at the left edge.
    if (left + w > vw - EDGE) left = vw - w - EDGE;
    if (left < EDGE) left = EDGE;
    if (top + h > vh - EDGE) top = vh - h - EDGE;
    if (top < EDGE) top = EDGE;

    // Arrow tracks the trigger's centre even when the bubble is shifted by the clamp.
    const pad = 8;
    let arrow;
    if (side === 'top' || side === 'bottom') {
      arrow = Math.max(pad, Math.min(w - pad, t.left + t.width / 2 - left));
    } else {
      arrow = Math.max(pad, Math.min(h - pad, t.top + t.height / 2 - top));
    }

    setCoords({ top, left, side });
    setArrowOffset(arrow);
  }, [visible, position, content, maxWidth, hardCap]);

  // Hide at once when the content goes away (e.g. the sidebar expands and drops its label).
  useEffect(() => {
    if (!content) {
      clearTimeout(timeoutRef.current);
      setVisible(false);
    }
  }, [content]);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
      clearTimeout(hideTimerRef.current);
    },
    [],
  );

  // Self-heal: mouseleave never fires when the trigger is removed mid-hover.
  useEffect(() => {
    if (!visible) return undefined;
    let frame;
    const check = () => {
      const el = triggerRef.current;
      if (!el || !el.isConnected) {
        hide();
        return;
      }
      frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [visible, hide]);

  // Hide on every route change (covers triggers in the layout that survive navigation).
  const pathname = useSafePathname();
  useEffect(() => {
    hide();
  }, [pathname, hide]);

  // Hide when the page scrolls — the bubble is fixed and would otherwise float away.
  useEffect(() => {
    if (!visible) return undefined;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [visible, hide]);

  const side = coords.side || position;
  const arrowStyle =
    arrowOffset == null ? undefined : side === 'top' || side === 'bottom' ? { left: arrowOffset } : { top: arrowOffset };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={(e) => {
          // Keyboard focus only — not the focus a click or an opening drawer moves onto a button.
          let keyboard = true;
          try {
            keyboard = e.target.matches(':focus-visible');
          } catch {
            /* old browser: treat as keyboard */
          }
          if (keyboard) show();
        }}
        onBlur={hide}
        onMouseDown={hide}
        onClick={hide}
        onKeyDown={(e) => {
          if (e.key === 'Escape') hide();
        }}
        data-tooltip-wrapper="true"
        className={className || 'inline-flex items-center'}
      >
        {children}
      </span>
      {visible &&
        content &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            onMouseEnter={interactive ? cancelHide : undefined}
            onMouseLeave={interactive ? scheduleHide : undefined}
            className={`fixed z-[9999] animate-tooltip-pop break-words whitespace-normal rounded-md px-2.5 py-1.5 text-xs font-medium leading-snug normal-case tracking-normal shadow-lg ring-1 ring-white/15 bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 dark:ring-black/10 ${
              interactive ? '' : 'pointer-events-none'
            }`}
            style={{
              top: coords.top,
              left: coords.left,
              width: 'max-content',
              maxWidth,
              // visibility (not display) so the first layout pass can measure the real size.
              visibility: coords.top === -9999 ? 'hidden' : 'visible',
            }}
          >
            {content}
            <span
              aria-hidden="true"
              className={`absolute h-2 w-2 rotate-45 bg-neutral-900 dark:bg-neutral-100 ${ARROW_SIDE[side] || ARROW_SIDE.top}`}
              style={arrowStyle}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
