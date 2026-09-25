import './helpers/setupPlatformOwnerEnv.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';
import { Family } from '../src/models/Family.js';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { getEffectiveFamilySettings, getEffectivePlatformLimits } from '../src/utils/effectiveSettings.js';
import { PLATFORM_OWNER_EMAIL } from './helpers/setupPlatformOwnerEnv.js';

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

// Whatever this environment's env resolves to (a local server/.env may legitimately differ from
// .env.example) — never hardcoded.
const LIMIT_ENV = {
  activityRetentionDays: env.ACTIVITY_RETENTION_DAYS,
  maxFileMB: env.MAX_FILE_MB,
  storageLimitMB: env.STORAGE_LIMIT_MB,
};

// Simulates a family saved before these limits became platform-only: writes straight to the raw
// collection, bypassing the (now field-less) Family schema.
async function storeLegacyFamilyOverrides(familyId, values) {
  const $set = Object.fromEntries(Object.entries(values).map(([k, v]) => [`settings.${k}`, v]));
  await Family.collection.updateOne({ _id: new mongoose.Types.ObjectId(familyId) }, { $set });
}

describe('operational limits resolve platform value -> env only', () => {
  it('fall back to env when the platform has no value', async () => {
    const s = await signupFamily(app);
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff).toMatchObject(LIMIT_ENV);
    expect(await getEffectivePlatformLimits()).toEqual(LIMIT_ENV);
  });

  it('use the platform value once set', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate(
      'platform',
      { activityRetentionDays: 120, maxFileMB: 77, storageLimitMB: 2048 },
      { upsert: true },
    );
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff).toMatchObject({ activityRetentionDays: 120, maxFileMB: 77, storageLimitMB: 2048 });
  });

  it('ignore a stale per-family override stored in the DB (platform set)', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate(
      'platform',
      { activityRetentionDays: 120, maxFileMB: 77, storageLimitMB: 2048 },
      { upsert: true },
    );
    await storeLegacyFamilyOverrides(s.familyId, { activityRetentionDays: 45, maxFileMB: 5, storageLimitMB: 100 });
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff).toMatchObject({ activityRetentionDays: 120, maxFileMB: 77, storageLimitMB: 2048 });
  });

  it('ignore a stale per-family override stored in the DB (platform unset -> env)', async () => {
    const s = await signupFamily(app);
    await storeLegacyFamilyOverrides(s.familyId, { activityRetentionDays: 45, maxFileMB: 5, storageLimitMB: 100 });
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff).toMatchObject(LIMIT_ENV);
  });

  it('clearing a platform value (null) falls back to env again', async () => {
    const s = await signupFamily(app);
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: 120, maxFileMB: 77 }, { upsert: true });
    await PlatformSettings.findByIdAndUpdate('platform', { activityRetentionDays: null, maxFileMB: null }, { upsert: true });
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff).toMatchObject(LIMIT_ENV);
  });

  it('defaultShareDuration is still read from the family', async () => {
    const s = await signupFamily(app);
    await Family.findByIdAndUpdate(s.familyId, { 'settings.defaultShareDuration': '7d' });
    const eff = await getEffectiveFamilySettings(s.familyId);
    expect(eff.defaultShareDuration).toBe('7d');
  });

  it('never throws on a bad family id — resolves to defaults', async () => {
    const eff = await getEffectiveFamilySettings('not-an-object-id');
    expect(eff).toMatchObject({ ...LIMIT_ENV, defaultShareDuration: '12h' });
  });
});

describe('GET/PATCH /platform-settings — upload & storage limits', () => {
  it('public GET returns the raw stored maxFileMB/storageLimitMB (null when unset), no owner extras', async () => {
    const res = await request(app).get('/api/platform-settings');
    expect(res.status).toBe(200);
    expect(res.body.maxFileMB).toBeNull();
    expect(res.body.storageLimitMB).toBeNull();
    expect(res.body).not.toHaveProperty('defaults');
    expect(res.body).not.toHaveProperty('storageDriver');
  });

  it('a logged-in non-owner does not get the owner extras either', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/platform-settings').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isPlatformOwner).toBe(false);
    expect(res.body).not.toHaveProperty('defaults');
    expect(res.body).not.toHaveProperty('storageDriver');
  });

  it('the owner GET includes env defaults + the read-only storage driver', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const res = await request(app).get('/api/platform-settings').set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.isPlatformOwner).toBe(true);
    expect(res.body.defaults).toEqual(LIMIT_ENV);
    expect(res.body.storageDriver).toBe(env.STORAGE_DRIVER);
  });

  it('the owner can set and clear maxFileMB and storageLimitMB', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const set = await authed(request(app).patch('/api/platform-settings'), owner).send({ maxFileMB: 50, storageLimitMB: 2048 });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ maxFileMB: 50, storageLimitMB: 2048, storageDriver: env.STORAGE_DRIVER });
    expect(set.body.defaults).toEqual(LIMIT_ENV);

    const clear = await authed(request(app).patch('/api/platform-settings'), owner).send({ maxFileMB: null, storageLimitMB: null });
    expect(clear.status).toBe(200);
    expect(clear.body.maxFileMB).toBeNull();
    expect(clear.body.storageLimitMB).toBeNull();
  });

  it('PATCH of a limit is forbidden for anyone but the platform owner (403)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/platform-settings'), s).send({ maxFileMB: 50 });
    expect(res.status).toBe(403);
    const stored = await PlatformSettings.findById('platform').lean();
    expect(stored?.maxFileMB ?? null).toBeNull();
  });

  it.each([
    [{ maxFileMB: 0 }],
    [{ maxFileMB: 201 }],
    [{ storageLimitMB: 99 }],
  ])('rejects out-of-bounds %j with 400 VALIDATION_ERROR', async (body) => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const res = await authed(request(app).patch('/api/platform-settings'), owner).send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
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

  it('the owner can set activityRetentionDays', async () => {
    const owner = await signupFamily(app, { email: PLATFORM_OWNER_EMAIL });
    const res = await authed(request(app).patch('/api/platform-settings'), owner).send({ activityRetentionDays: 90 });
    expect(res.status).toBe(200);
    expect(res.body.activityRetentionDays).toBe(90);
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
