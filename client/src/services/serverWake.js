import { env } from '@/config/env.js';
import { SHOW_AFTER_MS, countsAsServerAnswer, shouldRetryDuringWake } from './serverWakeTiming.js';

/**
 * Knows whether the API server is awake yet.
 *
 * The API runs on a free host that sleeps after ~15 minutes without visitors and takes about a
 * minute to start again. On app start we send one light `GET /health` next to the normal
 * start-up requests; the first real answer from the server (the probe or any other request)
 * marks it "awake". `WakeUpScreen` shows while it is not, and `apiClient` quietly retries reads
 * that failed during the warm-up once it is.
 *
 * Coming back to a tab that sat in the background long enough for the server to fall asleep
 * again starts the same check over.
 */

/** Requests sent before the server has answered get this long, enough for a ~60s cold start. */
export const WAKE_REQUEST_TIMEOUT_MS = 90_000;
const PROBE_RETRY_DELAY_MS = 3_000;
/** The host sleeps after 15 minutes without traffic; re-check a little before that. */
const ASLEEP_AFTER_QUIET_MS = 14 * 60_000;

let state = { awake: false, startedAt: 0, online: true };
let started = false;
let lastAnswerAt = 0;
let generation = 0;
let probeController = null;
let probeTimer = null;
let waiters = [];
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function isOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Snapshot for `useSyncExternalStore`: `{ awake, startedAt, online }`. */
export function getServerWakeState() {
  return state;
}

export function subscribeServerWake(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isServerAwake() {
  return state.awake;
}

/** Resolves once the server has answered (right away if it already has). */
export function waitForServerAwake() {
  if (state.awake) return Promise.resolve();
  return new Promise((resolve) => waiters.push(resolve));
}

function stopProbe() {
  generation += 1;
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  if (probeController) probeController.abort();
  probeController = null;
}

/** Called on every answer from our server. The first one hides the waking-up screen. */
export function markServerAwake() {
  lastAnswerAt = Date.now();
  if (state.awake) return;
  stopProbe();
  setState({ awake: true });
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve());
}

/** Same, for a failed request: only when the answer came from our app, not the host's proxy. */
export function noteServerError(error) {
  const status = error?.response?.status;
  if (countsAsServerAnswer(status)) markServerAwake();
}

async function probe(gen) {
  const controller = new AbortController();
  probeController = controller;
  const timer = setTimeout(() => controller.abort(), WAKE_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.apiBaseUrl.replace(/\/+$/, '')}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (gen !== generation) return;
    if (countsAsServerAnswer(res.status)) {
      markServerAwake();
      return;
    }
  } catch {
    // Offline, timed out, or the host dropped the connection while starting — try again below.
  } finally {
    clearTimeout(timer);
    if (probeController === controller) probeController = null;
  }
  if (gen !== generation || state.awake) return;
  probeTimer = setTimeout(() => probe(gen), PROBE_RETRY_DELAY_MS);
}

function runProbe() {
  stopProbe();
  probe(generation);
}

/**
 * "Try again": restart the clock (back from the slow screen to the waking one, which stays on
 * screen rather than disappearing for the first 2.5s) and ask the server right away.
 */
export function retryServerWake() {
  if (state.awake) return;
  setState({ startedAt: Date.now() - SHOW_AFTER_MS, online: isOnline() });
  runProbe();
}

function handleVisible() {
  if (document.visibilityState !== 'visible' || !state.awake) return;
  if (Date.now() - lastAnswerAt < ASLEEP_AFTER_QUIET_MS) return;
  setState({ awake: false, startedAt: Date.now(), online: isOnline() });
  runProbe();
}

/** Start the check once, as early as possible (main.jsx, before the first render). */
export function startServerWake() {
  if (started || typeof window === 'undefined') return;
  started = true;
  setState({ startedAt: Date.now(), online: isOnline() });
  window.addEventListener('online', () => {
    setState({ online: true });
    if (!state.awake) retryServerWake();
  });
  window.addEventListener('offline', () => setState({ online: false }));
  document.addEventListener('visibilitychange', handleVisible);
  runProbe();
}

/**
 * Runs a read request (for a page that does not go through `apiClient`, e.g. the public share
 * page) and, if it failed only because the server was still starting, retries it quietly — at
 * most twice — once the server is awake. Never use it for anything that changes data.
 */
export async function withWakeRetry(request, { method = 'get', maxRetries = 2 } = {}) {
  let retries = 0;
  for (;;) {
    const sentBeforeAwake = !state.awake;
    try {
      const result = await request();
      markServerAwake();
      return result;
    } catch (error) {
      noteServerError(error);
      const retry = shouldRetryDuringWake({
        method,
        sentBeforeAwake,
        retries,
        maxRetries,
        code: error?.code,
        status: error?.response?.status,
        hasResponse: Boolean(error?.response),
      });
      if (!retry) throw error;
      retries += 1;
      await waitForServerAwake();
    }
  }
}
