import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
}

function eventTarget() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => {
      (listeners[type] ||= new Set()).add(fn);
    },
    removeEventListener: (type, fn) => listeners[type]?.delete(fn),
    fire: (type) => listeners[type]?.forEach((fn) => fn({ type })),
    count: (type) => listeners[type]?.size || 0,
  };
}

let idle;
let win;
let doc;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T10:00:00Z'));
  win = eventTarget();
  win.setInterval = (fn, ms) => setInterval(fn, ms);
  win.clearInterval = (id) => clearInterval(id);
  doc = eventTarget();
  doc.visibilityState = 'visible';
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.resetModules();
  idle = await import('../idleSession.js');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const MIN = 60 * 1000;

describe('isIdleExpired', () => {
  it('is false with no recorded activity, and true only after 60 minutes', () => {
    expect(idle.isIdleExpired()).toBe(false);
    idle.markActivity(Date.now(), { force: true });
    expect(idle.isIdleExpired(Date.now() + 59 * MIN)).toBe(false);
    expect(idle.isIdleExpired(Date.now() + 61 * MIN)).toBe(true);
  });

  it('shares the last activity through localStorage (other tabs)', () => {
    idle.markActivity(Date.now() - 2 * 60 * MIN, { force: true });
    expect(idle.isIdleExpired()).toBe(true);
    // Another tab records activity.
    localStorage.setItem(idle.LAST_ACTIVITY_KEY, String(Date.now()));
    expect(idle.isIdleExpired()).toBe(false);
  });
});

describe('markActivity', () => {
  it('throttles frequent writes unless forced', () => {
    const t0 = Date.now();
    idle.markActivity(t0, { force: true });
    idle.markActivity(t0 + 1000);
    expect(idle.getLastActivity()).toBe(t0);
    idle.markActivity(t0 + 6000);
    expect(idle.getLastActivity()).toBe(t0 + 6000);
  });

  it('clearActivity forgets it', () => {
    idle.markActivity(Date.now(), { force: true });
    idle.clearActivity();
    expect(idle.getLastActivity()).toBeNull();
  });
});

describe('idle sign-out flag', () => {
  it('is set, read and cleared', () => {
    expect(idle.hasIdleSignoutFlag()).toBe(false);
    idle.setIdleSignoutFlag();
    expect(idle.hasIdleSignoutFlag()).toBe(true);
    idle.clearIdleSignoutFlag();
    expect(idle.hasIdleSignoutFlag()).toBe(false);
  });
});

describe('startIdleWatch', () => {
  it('signs out once after 60 minutes with no activity', () => {
    const onIdle = vi.fn();
    const stop = idle.startIdleWatch(onIdle);
    vi.advanceTimersByTime(59 * MIN);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1);
    stop();
  });

  it('real activity keeps the session alive', () => {
    const onIdle = vi.fn();
    const stop = idle.startIdleWatch(onIdle);
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(40 * MIN);
      win.fire('pointerdown');
    }
    expect(onIdle).not.toHaveBeenCalled();
    stop();
  });

  it('coming back to the tab after too long signs out instead of counting as activity', () => {
    const onIdle = vi.fn();
    const stop = idle.startIdleWatch(onIdle, { intervalMs: 24 * 60 * MIN });
    vi.setSystemTime(Date.now() + 2 * 60 * MIN); // laptop asleep: no timers ran
    win.fire('keydown');
    expect(onIdle).toHaveBeenCalledTimes(1);
    stop();
  });

  it('checks straight away when a session is already idle, and stop() removes listeners', () => {
    idle.markActivity(Date.now() - 2 * 60 * MIN, { force: true });
    const onIdle = vi.fn();
    const stop = idle.startIdleWatch(onIdle);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(win.count('keydown')).toBe(1);
    stop();
    expect(win.count('keydown')).toBe(0);
    expect(doc.count('visibilitychange')).toBe(0);
  });
});
