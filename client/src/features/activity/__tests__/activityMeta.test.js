import { describe, expect, it } from 'vitest';
import { describeActivityMeta } from '../activityMeta.js';

// English fallbacks, with {{placeholders}} filled in like i18next would.
const t = (_key, fallback, opts = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(opts[k]));

describe('describeActivityMeta', () => {
  it('never shows raw ids or internal keys', () => {
    const line = describeActivityMeta({ meta: { fileId: '6ab8e5ecc5fc2521a6821554', name: 'aadhaar-card.png', actorUserId: '6ab8e5ecc5fc2521a6821555' } }, t);
    expect(line).toBe('“aadhaar-card.png”');
    expect(line).not.toMatch(/fileId|6ab8/);
  });

  it('turns changed keys into plain words', () => {
    expect(describeActivityMeta({ meta: { changedKeys: ['name'] } }, t)).toBe('changed: name');
    expect(describeActivityMeta({ meta: { title: 'SBI net banking', fields: ['username', 'password'] } }, t)).toBe(
      '“SBI net banking” · changed: username, password',
    );
    expect(describeActivityMeta({ meta: { fields: ['fileText'], fileId: '6ab8e5ecc5fc2521a6821554' } }, t)).toBe(
      'changed: text read from the file',
    );
  });

  it('describes sign-ins, counts, kinds and share links', () => {
    expect(describeActivityMeta({ meta: { method: 'google' } }, t)).toBe('with Google');
    expect(describeActivityMeta({ meta: { count: 1 } }, t)).toBe('1 file');
    expect(describeActivityMeta({ meta: { count: 3 } }, t)).toBe('3 files');
    expect(describeActivityMeta({ meta: { title: 'Bank login', kind: 'login' } }, t)).toBe('“Bank login” · password');
    expect(describeActivityMeta({ meta: { duration: '24h', fileCount: null } }, t)).toBe('link lasts 1 day');
    expect(describeActivityMeta({ meta: { revoke: false, extendTo: '7d' } }, t)).toBe('link now lasts 7 days');
  });

  it('returns null when there is nothing useful to say', () => {
    expect(describeActivityMeta({ meta: {} }, t)).toBeNull();
    expect(describeActivityMeta({ meta: { event: 'invite_accepted', emailed: false } }, t)).toBeNull();
    expect(describeActivityMeta({}, t)).toBeNull();
  });
});
