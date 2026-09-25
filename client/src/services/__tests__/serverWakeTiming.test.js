import { describe, expect, it } from 'vitest';
import {
  ALMOST_THERE_AFTER_MS,
  PROGRESS_CAP,
  SHOW_AFTER_MS,
  SLOW_AFTER_MS,
  countsAsServerAnswer,
  shouldRetryDuringWake,
  wakePhase,
  wakeProgress,
  wakeStatusIndex,
} from '../serverWakeTiming.js';

describe('wakePhase', () => {
  it('stays hidden for a fast answer and once awake', () => {
    expect(wakePhase({ awake: false, elapsedMs: 0 })).toBe('hidden');
    expect(wakePhase({ awake: false, elapsedMs: SHOW_AFTER_MS - 1 })).toBe('hidden');
    expect(wakePhase({ awake: true, elapsedMs: 10_000 })).toBe('hidden');
    expect(wakePhase({ awake: true, elapsedMs: SLOW_AFTER_MS + 1 })).toBe('hidden');
  });

  it('shows the waking screen after 2.5s and the slow one after 75s', () => {
    expect(wakePhase({ awake: false, elapsedMs: SHOW_AFTER_MS })).toBe('waking');
    expect(wakePhase({ awake: false, elapsedMs: 60_000 })).toBe('waking');
    expect(wakePhase({ awake: false, elapsedMs: SLOW_AFTER_MS })).toBe('slow');
  });

  it('goes straight to the slow screen when offline, but not before 2.5s', () => {
    expect(wakePhase({ awake: false, elapsedMs: 1_000, online: false })).toBe('hidden');
    expect(wakePhase({ awake: false, elapsedMs: SHOW_AFTER_MS, online: false })).toBe('slow');
  });
});

describe('wakeProgress', () => {
  it('starts at 0, grows, and never passes the cap', () => {
    expect(wakeProgress(0)).toBe(0);
    expect(wakeProgress(-5)).toBe(0);
    expect(wakeProgress(NaN)).toBe(0);
    expect(wakeProgress(20_000)).toBeGreaterThan(wakeProgress(10_000));
    expect(wakeProgress(60_000)).toBeGreaterThan(80);
    expect(wakeProgress(10 * 60_000)).toBeLessThanOrEqual(PROGRESS_CAP);
  });
});

describe('wakeStatusIndex', () => {
  it('cycles the first three lines every 4s, then holds "almost there"', () => {
    expect(wakeStatusIndex(0)).toBe(0);
    expect(wakeStatusIndex(4_000)).toBe(1);
    expect(wakeStatusIndex(8_000)).toBe(2);
    expect(wakeStatusIndex(12_000)).toBe(0);
    expect(wakeStatusIndex(ALMOST_THERE_AFTER_MS - 1)).not.toBe(3);
    expect(wakeStatusIndex(ALMOST_THERE_AFTER_MS)).toBe(3);
    expect(wakeStatusIndex(SLOW_AFTER_MS)).toBe(3);
  });
});

describe('countsAsServerAnswer', () => {
  it('counts app answers, not the host proxy while starting', () => {
    expect(countsAsServerAnswer(200)).toBe(true);
    expect(countsAsServerAnswer(401)).toBe(true);
    expect(countsAsServerAnswer(404)).toBe(true);
    expect(countsAsServerAnswer(500)).toBe(true);
    expect(countsAsServerAnswer(502)).toBe(false);
    expect(countsAsServerAnswer(503)).toBe(false);
    expect(countsAsServerAnswer(504)).toBe(false);
    expect(countsAsServerAnswer(undefined)).toBe(false);
  });
});

describe('shouldRetryDuringWake', () => {
  const timeout = { sentBeforeAwake: true, code: 'ECONNABORTED', hasResponse: false };

  it('retries reads that timed out or hit 502/503/504 during warm-up', () => {
    expect(shouldRetryDuringWake({ ...timeout, method: 'get' })).toBe(true);
    expect(shouldRetryDuringWake({ ...timeout, method: 'HEAD' })).toBe(true);
    expect(shouldRetryDuringWake({ ...timeout, method: undefined })).toBe(true);
    for (const status of [502, 503, 504]) {
      expect(shouldRetryDuringWake({ method: 'get', sentBeforeAwake: true, status, hasResponse: true })).toBe(true);
    }
  });

  it('never retries writes', () => {
    for (const method of ['post', 'put', 'patch', 'delete', 'POST']) {
      expect(shouldRetryDuringWake({ ...timeout, method })).toBe(false);
    }
  });

  it('does not retry once the server was awake, after 2 retries, on cancel, or on real errors', () => {
    expect(shouldRetryDuringWake({ ...timeout, method: 'get', sentBeforeAwake: false })).toBe(false);
    expect(shouldRetryDuringWake({ ...timeout, method: 'get', retries: 1 })).toBe(true);
    expect(shouldRetryDuringWake({ ...timeout, method: 'get', retries: 2 })).toBe(false);
    expect(shouldRetryDuringWake({ ...timeout, method: 'get', code: 'ERR_CANCELED' })).toBe(false);
    for (const status of [400, 401, 404, 500]) {
      expect(shouldRetryDuringWake({ method: 'get', sentBeforeAwake: true, status, hasResponse: true })).toBe(false);
    }
  });
});
