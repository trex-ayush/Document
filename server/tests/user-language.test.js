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

describe('user language', () => {
  it('starts unset, is saved with PATCH /auth/me and comes back on /auth/me and sign-in', async () => {
    const s = await signupFamily(app);
    expect(s.user.language).toBeNull();

    const patched = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ language: 'hi' });
    expect(patched.status).toBe(200);
    expect(patched.body.user.language).toBe('hi');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${s.accessToken}`);
    expect(me.body.user.language).toBe('hi');

    // A sign-in from another device gets the saved language too.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: s.payload.email, password: s.payload.password });
    expect(login.status).toBe(200);
    expect(login.body.user.language).toBe('hi');
  });

  it('rejects a language the app does not support', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ language: 'fr' });
    expect(res.status).toBe(400);
  });
});
