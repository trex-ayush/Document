/**
 * In-memory password-attempt lockout counter for public share links, keyed by `${shareId}:${ipHash}`.
 *
 * NOTE (documented judgment call, see final report): this is a simple per-process Map, not a DB
 * table or a shared cache (Redis etc). That means the counter resets whenever the server process
 * restarts, and it does NOT synchronize across multiple server instances if this app is ever
 * scaled horizontally — an attacker distributed across instances (or one who just waits for a
 * deploy) could get more than 5 attempts. Acceptable for this single-instance deployment; anyone
 * hardening this later should swap this module's internals for a DB/Redis-backed counter without
 * touching its call sites (`isLockedOut` / `recordFailure` / `resetLockout`).
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map();

function isExpired(entry, now) {
  return now - entry.windowStart > WINDOW_MS;
}

/** True once `recordFailure` has been called MAX_ATTEMPTS times within the current window. */
export function isLockedOut(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (isExpired(entry, now)) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

/** Records one failed password attempt for `key`. Returns the new count within the window. */
export function recordFailure(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || isExpired(entry, now)) {
    attempts.set(key, { count: 1, windowStart: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/** Clears the counter for `key` (called after a successful password check). */
export function resetLockout(key) {
  attempts.delete(key);
}

/** Test-only: wipe every counter so tests don't leak state into each other. */
export function _clearAllLockouts() {
  attempts.clear();
}
