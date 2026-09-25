/**
 * Pure timing rules for the "waking up the server" screen (no imports, no browser APIs, so it
 * can be tested on its own). See services/serverWake.js for the moving parts.
 *
 * The API runs on a free host that goes to sleep after ~15 minutes without visitors and needs
 * about a minute to start again. These numbers shape what people see while that happens.
 */

/** Wait this long for the first answer before showing the waking-up screen at all. */
export const SHOW_AFTER_MS = 2_500;

/** After this long without an answer, switch to "still starting… check your internet". */
export const SLOW_AFTER_MS = 75_000;

/** The progress bar never claims more than this until the server really answers. */
export const PROGRESS_CAP = 95;

/** Time constant of the ease-out curve: ~60% at 20s, ~90% at 60s, then creeping towards the cap. */
const PROGRESS_TAU_MS = 20_000;

/**
 * Which screen to show.
 * @param {{ awake: boolean, elapsedMs: number, online?: boolean }} input
 * @returns {'hidden' | 'waking' | 'slow'}
 */
export function wakePhase({ awake, elapsedMs, online = true }) {
  if (awake) return 'hidden';
  if (elapsedMs < SHOW_AFTER_MS) return 'hidden';
  if (!online || elapsedMs >= SLOW_AFTER_MS) return 'slow';
  return 'waking';
}

/**
 * Progress bar width in percent (0..PROGRESS_CAP). Eases out and holds just under the cap — it
 * is a reassurance, not a measurement.
 * @param {number} elapsedMs
 */
export function wakeProgress(elapsedMs) {
  if (!(elapsedMs > 0)) return 0;
  const value = PROGRESS_CAP * (1 - Math.exp(-elapsedMs / PROGRESS_TAU_MS));
  return Math.min(PROGRESS_CAP, Math.round(value * 10) / 10);
}

/**
 * Whether an HTTP status came from our own app (so the server is up). 502/503/504 are what the
 * host's proxy answers while the app is still starting, so they do not count.
 * @param {number | undefined} status
 */
export function countsAsServerAnswer(status) {
  if (!status) return false;
  return status !== 502 && status !== 503 && status !== 504;
}

/** From here on the status line holds "Almost there…" (a cold start takes about a minute). */
export const ALMOST_THERE_AFTER_MS = 40_000;

/**
 * Which rotating status line to show (index into the list of 4). Cycles through the first
 * three every `stepMs`, then holds the last one ("Almost there…") once most of a cold start
 * has gone by, so it is never said too early.
 * @param {number} elapsedMs
 */
export function wakeStatusIndex(elapsedMs, stepMs = 4_000) {
  if (elapsedMs >= ALMOST_THERE_AFTER_MS) return 3;
  return Math.floor(Math.max(0, elapsedMs) / stepMs) % 3;
}

/**
 * Whether a failed axios request should be quietly retried once the server is up: only
 * reads (GET/HEAD), only when the server had not answered yet when it was sent, only when the
 * failure looks like "the server was not there" (timeout, no response, or the host's own
 * 502/503/504 while the app boots), and at most `maxRetries` times.
 * @param {{ method?: string, sentBeforeAwake?: boolean, retries?: number, code?: string,
 *   status?: number, hasResponse?: boolean, maxRetries?: number }} input
 */
export function shouldRetryDuringWake({
  method,
  sentBeforeAwake,
  retries = 0,
  code,
  status,
  hasResponse,
  maxRetries = 2,
}) {
  const m = (method || 'get').toLowerCase();
  if (m !== 'get' && m !== 'head') return false;
  if (!sentBeforeAwake) return false;
  if (retries >= maxRetries) return false;
  if (code === 'ERR_CANCELED') return false;
  if (!hasResponse) return true; // timeout / network error
  return status === 502 || status === 503 || status === 504;
}
