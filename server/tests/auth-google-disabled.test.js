// Deliberately does NOT import helpers/setupGoogleEnv.js — GOOGLE_CLIENT_ID is forced empty here
// (see helpers/setupGoogleEnvDisabled.js — a real `server/.env` dev file, if one happens to exist
// in this sandbox, would otherwise leak a genuine client id into this suite via dotenv), exercising
// the "feature off" posture described in docs/DECISIONS.md's "Google sign-in" section: every
// /auth/google* route must respond 501 GOOGLE_SIGNIN_DISABLED before doing anything else, rather
// than half-working.
import './helpers/setupGoogleEnvDisabled.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp } from './helpers/factory.js';

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
    const res = await request(app).post('/api/auth/google/complete').send({ signupToken: 'irrelevant' });
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('GOOGLE_SIGNIN_DISABLED');
  });
});
