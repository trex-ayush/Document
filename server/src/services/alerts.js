/**
 * Integration seam for the email/notifications module (owned separately — mailer, admin instant
 * alerts, daily digest). `activityLogger.js` calls `onActivity()` after every Activity is saved;
 * this stub is a no-op until that module fills it in, so activity logging never depends on email
 * code existing yet (same pattern as `modules/items/integration.js`).
 *
 * Must never throw — the caller already wraps this in a best-effort catch, but keep it safe on
 * its own too (e.g. if SMTP isn't configured, this should just skip silently, not error).
 */
// eslint-disable-next-line no-unused-vars
export async function onActivity(activity) {
  // no-op stub
}
