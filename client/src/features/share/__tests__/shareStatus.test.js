import { describe, it, expect } from 'vitest';
import { durationLabel, familyShareDuration, formatTimeRemaining, shareStatusOf } from '../shareStatus.js';

const t = (key, fallback, opts) => (fallback || key).replace('{{count}}', opts?.count ?? '');

describe('family share duration', () => {
  it('reads the default from either place GET /family may put it', () => {
    expect(familyShareDuration({ defaultShareDuration: '7d' })).toBe('7d');
    expect(familyShareDuration({ settings: { defaultShareDuration: '24h' } })).toBe('24h');
  });

  it('falls back to 12 hours for missing or unknown values', () => {
    expect(familyShareDuration(null)).toBe('12h');
    expect(familyShareDuration({ defaultShareDuration: '30d' })).toBe('12h');
  });

  it('labels each option in plain words', () => {
    expect(['12h', '24h', '7d'].map((v) => durationLabel(v))).toEqual(['12 hours', '1 day', '7 days']);
  });
});

describe('share status', () => {
  const inHours = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

  it('derives active, expired and revoked', () => {
    expect(shareStatusOf({ expiresAt: inHours(2) })).toBe('active');
    expect(shareStatusOf({ expiresAt: inHours(-1) })).toBe('expired');
    expect(shareStatusOf({ expiresAt: inHours(2), revokedAt: new Date().toISOString() })).toBe('revoked');
  });

  it('says how long is left', () => {
    expect(formatTimeRemaining({ expiresAt: inHours(12) }, t)).toBe('12 hours left');
    expect(formatTimeRemaining({ expiresAt: inHours(1) }, t)).toBe('1 hour left');
    expect(formatTimeRemaining({ expiresAt: inHours(24 * 7) }, t)).toBe('7 days left');
    expect(formatTimeRemaining({ expiresAt: inHours(-1) }, t)).toBe('Expired');
    expect(formatTimeRemaining({ expiresAt: inHours(2), revokedAt: 'x' }, t)).toBe('Turned off');
  });
});
