import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';

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

describe('POST /family (create)', () => {
  it('creates the family + owner/admin membership + seeds default folders and document types', async () => {
    const payload = { name: 'Fresh Owner', email: `fresh-owner-${Date.now()}@example.com`, password: 'password123' };
    const signupRes = await request(app).post('/api/auth/signup').send(payload).expect(201);

    const res = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
      .send({ familyName: 'The Fresh Family' });
    expect(res.status).toBe(201);
    expect(res.body.family).toMatchObject({ name: 'The Fresh Family' });
    expect(res.body.family.slug).toBeTruthy();
    expect(res.body.membership).toMatchObject({ role: 'admin', access: 'write', isOwner: true, status: 'active' });

    const dtRes = await request(app)
      .get('/api/document-types')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
      .set('X-Family-Id', res.body.family.id);
    expect(dtRes.status).toBe(200);
    expect(dtRes.body.items.length).toBeGreaterThan(0);
  });

  it('does NOT require X-Family-Id (that is the whole point of this endpoint)', async () => {
    const payload = { name: 'No Header Needed', email: `no-header-${Date.now()}@example.com`, password: 'password123' };
    const signupRes = await request(app).post('/api/auth/signup').send(payload).expect(201);
    const res = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
      .send({ familyName: 'No Header Family' });
    expect(res.status).toBe(201);
  });

  it('rejects a missing familyName with 400 VALIDATION_ERROR', async () => {
    const payload = { name: 'Bad Body', email: `bad-body-${Date.now()}@example.com`, password: 'password123' };
    const signupRes = await request(app).post('/api/auth/signup').send(payload).expect(201);
    const res = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /family', () => {
  it('returns the caller family with default settings + storageDriver', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).get('/api/family'), s);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(s.family.name);
    expect(res.body.settings.requireReauthForSecrets).toBe(true);
    expect(res.body.settings.activityRetentionDays).toBeNull();
    expect(res.body.settings.maxFileMB).toBeNull();
    expect(res.body.settings.storageLimitMB).toBeNull();
    expect(typeof res.body.storageDriver).toBe('string');
  });

  it('400 MISSING_FAMILY_ID with no X-Family-Id header', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/family').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FAMILY_ID');
  });

  it('403 NOT_A_MEMBER for a family the caller does not belong to', async () => {
    const s1 = await signupFamily(app);
    const s2 = await signupFamily(app);
    const res = await request(app)
      .get('/api/family')
      .set('Authorization', `Bearer ${s1.accessToken}`)
      .set('X-Family-Id', s2.family.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
  });
});

describe('PATCH /family', () => {
  it('admin can toggle requireReauthForSecrets and rename the family', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/family'), s).send({
      name: 'Renamed Family',
      settings: { requireReauthForSecrets: false },
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Family');
    expect(res.body.settings.requireReauthForSecrets).toBe(false);
    // untouched setting is preserved
    expect(res.body.settings.activityRetentionDays).toBeNull();
  });

  it('admin can set maxFileMB, storageLimitMB and activityRetentionDays', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).patch('/api/family'), s).send({
      settings: { maxFileMB: 50, storageLimitMB: 1024, activityRetentionDays: 90 },
    });
    expect(res.status).toBe(200);
    expect(res.body.settings.maxFileMB).toBe(50);
    expect(res.body.settings.storageLimitMB).toBe(1024);
    expect(res.body.settings.activityRetentionDays).toBe(90);
  });

  it('rejects out-of-bounds settings with 400 VALIDATION_ERROR', async () => {
    const s = await signupFamily(app);
    const tooSmall = await authed(request(app).patch('/api/family'), s).send({ settings: { maxFileMB: 0 } });
    expect(tooSmall.status).toBe(400);

    const tooLow = await authed(request(app).patch('/api/family'), s).send({ settings: { activityRetentionDays: 5 } });
    expect(tooLow.status).toBe(400);
  });

  it('null resets a setting back to "use the env default"', async () => {
    const s = await signupFamily(app);
    await authed(request(app).patch('/api/family'), s).send({ settings: { maxFileMB: 50 } }).expect(200);
    const res = await authed(request(app).patch('/api/family'), s).send({ settings: { maxFileMB: null } });
    expect(res.status).toBe(200);
    expect(res.body.settings.maxFileMB).toBeNull();
  });

  it('non-admin member is forbidden (403)', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Member', email: 'famtest@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'famtest@example.com', password: 'password123' });

    const res = await request(app)
      .patch('/api/family')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Family-Id', s.family.id)
      .send({ name: 'Hacked Name' });
    expect(res.status).toBe(403);
  });

  it('400 MISSING_FAMILY_ID with no X-Family-Id header', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch('/api/family')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'No Header' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_FAMILY_ID');
  });
});
