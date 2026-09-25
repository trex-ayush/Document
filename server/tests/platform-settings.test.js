import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';
import { Family } from '../src/models/Family.js';
import { getEffectiveFamilySettings } from '../src/utils/effectiveSettings.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  app = buildApp();
  await clearDb();
});

describe('activityRetentionDays 3-tier resolution', () => {
  it('falls back to env.ACTIVITY_RETENTION_DAYS when neither family nor platform set a value', async () => {
    const s = await signupFamily(app);
    const { activityRetentionDays } = await getEffectiveFamilySettings(s.familyId);
    expect(activityRetentionDays).toBe(365); // helpers/setupEnv.js sets ACTIVITY_RETENTION_DAYS=365
  });

  it('platform default applies when the family has no override', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: 120 }, { upsert: true });

    const { activityRetentionDays } = await getEffectiveFamilySettings(s.familyId);
    expect(activityRetentionDays).toBe(120);
  });

  it('a family override still wins over the platform default', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: 120 }, { upsert: true });
    await Family.findByIdAndUpdate(s.familyId, { 'settings.activityRetentionDays': 45 });

    const { activityRetentionDays } = await getEffectiveFamilySettings(s.familyId);
    expect(activityRetentionDays).toBe(45);
  });

  it('clearing the platform default (null) falls back to env again', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: 120 }, { upsert: true });
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: null }, { upsert: true });

    const { activityRetentionDays } = await getEffectiveFamilySettings(s.familyId);
    expect(activityRetentionDays).toBe(365);
  });
});

describe('GET/PATCH /platform-settings — activityRetentionDays', () => {
  it('GET includes the raw stored activityRetentionDays (null when unset)', async () => {
    const res = await request(app).get('/api/platform-settings');
    expect(res.status).toBe(200);
    expect(res.body.activityRetentionDays).toBeNull();
  });

  it('GET reflects a platform default once set, still as the raw value (not resolved)', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: 90 }, { upsert: true });
    const res = await request(app).get('/api/platform-settings');
    expect(res.status).toBe(200);
    expect(res.body.activityRetentionDays).toBe(90);
  });

  it('PATCH is forbidden for anyone but the configured platform owner (403)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/platform-settings'), s).send({ activityRetentionDays: 90 });
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-bounds activityRetentionDays with 400 VALIDATION_ERROR', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/platform-settings'), s).send({ activityRetentionDays: 10 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET/PATCH /platform-settings — binRetentionDays', () => {
  it('GET includes the raw stored binRetentionDays (null when unset)', async () => {
    const res = await request(app).get('/api/platform-settings');
    expect(res.status).toBe(200);
    expect(res.body.binRetentionDays).toBeNull();
  });

  it('GET reflects a stored value once set', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { binRetentionDays: 60 }, { upsert: true });
    const res = await request(app).get('/api/platform-settings');
    expect(res.status).toBe(200);
    expect(res.body.binRetentionDays).toBe(60);
  });

  it('PATCH is forbidden for anyone but the configured platform owner (403)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/platform-settings'), s).send({ binRetentionDays: 60 });
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-bounds binRetentionDays with 400 VALIDATION_ERROR', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/platform-settings'), s).send({ binRetentionDays: 5 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
