import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';

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

describe('GET /family', () => {
  it('returns the caller family with default settings', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/family').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(s.family.name);
    expect(res.body.settings.requireReauthForSecrets).toBe(true);
    expect(res.body.settings.activityRetentionDays).toBe(365);
  });
});

describe('PATCH /family', () => {
  it('admin can toggle requireReauthForSecrets and rename the family', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch('/api/family')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Renamed Family', settings: { requireReauthForSecrets: false } });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Family');
    expect(res.body.settings.requireReauthForSecrets).toBe(false);
    // untouched setting is preserved
    expect(res.body.settings.activityRetentionDays).toBe(365);
  });

  it('non-admin member is forbidden (403)', async () => {
    const s = await signupFamily(app);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Member', email: 'famtest@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'famtest@example.com', password: 'password123' });

    const res = await request(app)
      .patch('/api/family')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ name: 'Hacked Name' });
    expect(res.status).toBe(403);
  });
});
