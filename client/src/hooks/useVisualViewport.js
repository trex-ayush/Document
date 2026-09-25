import { useEffect } from 'react';

/**
 * useVisualViewport — keeps Save buttons above the on-screen keyboard on phones.
 *
 * Android Chrome shrinks the layout viewport with the keyboard on its own
 * (`interactive-widget=resizes-content` in index.html), but iOS Safari only shrinks
 * the *visual* viewport, so anything pinned to the bottom ends up behind the keyboard.
 * While a text field is focused and the keyboard is up, this sets on <html>:
 *
 *  - `data-keyboard-open`  — hides the mobile tab bar, makes `.kb-sticky` save rows sticky
 *  - `--vvh`               — visible height (px); the Drawer uses it instead of 100dvh
 *  - `--vv-top`            — how far the visible area is scrolled down (px); Drawer top
 *  - `--keyboard-inset`    — how much of the layout viewport is under the keyboard (px)
 *
 * Nothing is set while the keyboard is closed, so desktop is untouched. The listeners
 * are shared: the first component that mounts the hook installs them, the last one
 * to unmount removes them.
 */

const OPEN_THRESHOLD = 120; // px the view must shrink by before we call it "keyboard open"
const REVEAL_DELAY = 300; // ms — roughly the keyboard's open animation

const NON_TEXT_INPUTS = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

export function isEditableField(el) {
  if (!el || el === document.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((el.getAttribute('type') || 'text').toLowerCase());
}

let users = 0;
let uninstall = null;

function install() {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return () => {};

  const root = document.documentElement;
  let baseline = 0; // tallest visible height seen at this width (keyboard closed)
  let baseWidth = root.clientWidth;
  let open = false;
  let lastHeight = 0;
  let frame = 0;
  let revealTimer = 0;

  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Bring the field being typed in back into view once the keyboard has taken its space.
  const reveal = () => {
    const el = document.activeElement;
    if (!open || !isEditableField(el)) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  };

  const clear = () => {
    root.removeAttribute('data-keyboard-open');
    root.style.removeProperty('--vvh');
    root.style.removeProperty('--vv-top');
    root.style.removeProperty('--keyboard-inset');
  };

  const update = () => {
    frame = 0;
    // Orientation / window-width change: the old "keyboard closed" height no longer applies.
    if (Math.abs(root.clientWidth - baseWidth) > 1) {
      baseWidth = root.clientWidth;
      baseline = 0;
    }
    // Multiply by scale so pinch-zoom is not mistaken for the keyboard.
    const visible = vv.height * (vv.scale || 1);
    baseline = Math.max(baseline, visible);
    // iOS: the layout viewport keeps its height and the keyboard covers its bottom part.
    // Android (resizes-content): the layout viewport shrinks too, so this stays ~0.
    const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    const nowOpen = isEditableField(document.activeElement) && baseline - visible > OPEN_THRESHOLD;

    if (!nowOpen) {
      if (open) clear();
      open = false;
      lastHeight = 0;
      return;
    }

    root.setAttribute('data-keyboard-open', '');
    root.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty('--keyboard-inset', `${Math.round(covered)}px`);
    const heightChanged = Math.abs(vv.height - lastHeight) > 1;
    open = true;
    lastHeight = vv.height;
    if (heightChanged) window.requestAnimationFrame(reveal);
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };

  // Moving between fields while the keyboard stays up fires no resize — reveal directly.
  const onFocusIn = (e) => {
    if (!isEditableField(e.target)) return;
    window.clearTimeout(revealTimer);
    revealTimer = window.setTimeout(() => {
      schedule();
      reveal();
    }, REVEAL_DELAY);
  };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  document.addEventListener('focusin', onFocusIn);
  update();

  return () => {
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    document.removeEventListener('focusin', onFocusIn);
    if (frame) window.cancelAnimationFrame(frame);
    window.clearTimeout(revealTimer);
    clear();
  };
}

export function useVisualViewport() {
  useEffect(() => {
    users += 1;
    if (users === 1) uninstall = install();
    return () => {
      users -= 1;
      if (users === 0 && uninstall) {
        uninstall();
        uninstall = null;
      }
    };
  }, []);
}

export default useVisualViewport;
