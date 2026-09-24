// Deliberately does NOT import helpers/setupGoogleEnv.js — GOOGLE_CLIENT_ID stays unset here
// (config/env.js defaults it to ''), exercising the "feature off" posture described in
// docs/DECISIONS.md's "Google sign-in" section: every /auth/google* route must respond 501
// GOOGLE_SIGNIN_DISABLED before doing anything else, rather than half-working.
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

describe('GOOGLE_CLIENT_ID unset', () => {
  it('POST /auth/google returns 501 GOOGLE_SIGNIN_DISABLED', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'irrelevant' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });

  it('POST /auth/google/complete returns 501 GOOGLE_SIGNIN_DISABLED', async () => {
    const res = await request(app)
      .post('/api/auth/google/complete')
      .send({ signupToken: 'irrelevant', familyName: 'Irrelevant Family' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });

  it('POST /auth/google/link returns 501 GOOGLE_SIGNIN_DISABLED', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/google/link')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ credential: 'irrelevant' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });

  it('POST /auth/google/unlink returns 501 GOOGLE_SIGNIN_DISABLED', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/google/unlink')
      .set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });

  it('POST /auth/reauth still works normally with a password (credential path is simply unreachable without a button to trigger it client-side)', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/reauth')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ password: s.payload.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.reauthToken).toBe('string');
  });
});
