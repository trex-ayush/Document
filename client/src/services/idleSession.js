/**
 * Idle sign-out (session locks after 60 minutes without real user activity).
 *
 * - "Real activity" = pointer, key, touch, wheel/scroll, or the tab coming back into view.
 *   Background refetches never touch this, so they can't keep a session alive.
 * - The last-activity time lives in localStorage, so every open tab shares it: working in
 *   one tab keeps the others signed in too, and all of them sign out together once idle.
 * - `isIdleExpired()` is also consulted by the API client before it silently refreshes the
 *   access token, so an idle session is never extended in the background.
 */

export const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const IDLE_CHECK_INTERVAL_MS = 30 * 1000;
export const LAST_ACTIVITY_KEY = 'family-vault-last-activity';
/** sessionStorage flag the login page reads to explain why the person was signed out. */
export const IDLE_SIGNOUT_FLAG_KEY = 'family-vault-idle-signout';

// Frequent events (mouse moves, scrolling) only write to storage this often.
const WRITE_THROTTLE_MS = 5 * 1000;

export const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'scroll'];

let lastWrite = 0;

function readNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Last recorded activity time (ms since epoch), or `null` when none is recorded yet. */
export function getLastActivity() {
  return readNumber(LAST_ACTIVITY_KEY);
}

/** Records "the person did something now". `force` skips the write throttle. */
export function markActivity(now = Date.now(), { force = false } = {}) {
  if (!force && now - lastWrite < WRITE_THROTTLE_MS) return;
  lastWrite = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // Storage unavailable — the in-tab timer still works from the last value we could read.
  }
}

/** Forgets the recorded activity (on sign-out), so the next sign-in starts fresh. */
export function clearActivity() {
  lastWrite = 0;
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

/**
 * True once more than `timeoutMs` has passed since the last recorded activity.
 * No recorded activity yet (e.g. a session from before this feature) counts as not idle.
 */
export function isIdleExpired(now = Date.now(), timeoutMs = IDLE_TIMEOUT_MS) {
  const last = getLastActivity();
  if (last === null) return false;
  return now - last > timeoutMs;
}

export function setIdleSignoutFlag() {
  try {
    sessionStorage.setItem(IDLE_SIGNOUT_FLAG_KEY, '1');
  } catch {
    // ignore
  }
}

/** True when the last sign-out in this tab was caused by inactivity. */
export function hasIdleSignoutFlag() {
  try {
    return sessionStorage.getItem(IDLE_SIGNOUT_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearIdleSignoutFlag() {
  try {
    sessionStorage.removeItem(IDLE_SIGNOUT_FLAG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Starts watching for activity and checking for idleness. Calls `onIdle()` once when the
 * shared last-activity time is older than the timeout. Returns a stop function.
 */
export function startIdleWatch(onIdle, { timeoutMs = IDLE_TIMEOUT_MS, intervalMs = IDLE_CHECK_INTERVAL_MS } = {}) {
  let fired = false;

  const check = () => {
    if (fired) return true;
    if (isIdleExpired(Date.now(), timeoutMs)) {
      fired = true;
      onIdle();
      return true;
    }
    return false;
  };

  const onActivity = () => {
    // Check first: coming back to a laptop after two hours must not count as fresh activity.
    if (!check()) markActivity();
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') onActivity();
  };

  if (getLastActivity() === null) markActivity(Date.now(), { force: true });
  else check();

  ACTIVITY_EVENTS.forEach((type) => window.addEventListener(type, onActivity, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(check, intervalMs);

  return () => {
    window.clearInterval(timer);
    ACTIVITY_EVENTS.forEach((type) => window.removeEventListener(type, onActivity, { capture: true }));
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
