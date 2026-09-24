import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, uniqueSignupBody } from './helpers/factory.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  // Fresh app per test => fresh in-memory rate-limit stores (app.js's own authLimiter etc. are
  // instantiated inside createApp(), not module-scope), so tests don't trip each other's 429s.
  app = buildApp();
  await clearDb();
});

describe('POST /auth/signup', () => {
  it('creates family + owner user + seeds default folders and document types', async () => {
    const payload = uniqueSignupBody();
    const res = await request(app).post('/api/auth/signup').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: payload.name, email: payload.email.toLowerCase() });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.membership).toMatchObject({ role: 'admin', access: 'write', isOwner: true, status: 'active' });
    expect(res.body.family).toMatchObject({ name: payload.familyName });
    expect(res.body.family.slug).toBeTruthy();
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');

    // seeded defaults are visible via document-types once logged in
    const dtRes = await request(app)
      .get('/api/document-types')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(dtRes.status).toBe(200);
    const names = dtRes.body.items.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'Aadhaar Card',
        'Bank Account',
        'Class 10 Marksheet',
        'Class 12 Marksheet',
        'Driving Licence',
        'Other',
        'PAN Card',
        'Passport',
        'Photograph',
        'Signature',
        'Voter ID',
      ].sort(),
    );

    // Aadhaar Card's identifying field is sensitive
    const aadhaar = dtRes.body.items.find((t) => t.name === 'Aadhaar Card');
    expect(aadhaar.fields.find((f) => f.key === 'Aadhaar Number').sensitive).toBe(true);
    expect(aadhaar.defaultFolderId).toBeTruthy();
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const payload = uniqueSignupBody();
    await request(app).post('/api/auth/signup').send(payload).expect(201);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...uniqueSignupBody(), email: payload.email });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials', async () => {
    const { payload } = await signupFamily(app);
    const res = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(payload.email.toLowerCase());
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    const { payload } = await signupFamily(app);
    const res = await request(app).post('/api/auth/login').send({ email: payload.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects unknown email with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('refresh token rotation + reuse detection', () => {
  it('rotates the refresh token on every call and revokes the old one', async () => {
    const signupBody = await signupFamily(app);
    const first = signupBody.refreshToken;

    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: first });
    expect(r1.status).toBe(200);
    const second = r1.body.refreshToken;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    // Using the (now-rotated-away) first token again must fail.
    const reuseFirst = await request(app).post('/api/auth/refresh').send({ refreshToken: first });
    expect(reuseFirst.status).toBe(401);
    expect(reuseFirst.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('treats reuse of a revoked token as theft and revokes the whole chain (tip included)', async () => {
    const signupBody = await signupFamily(app);
    const t0 = signupBody.refreshToken;

    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: t0 });
    const t1 = r1.body.refreshToken;
    const r2 = await request(app).post('/api/auth/refresh').send({ refreshToken: t1 });
    const t2 = r2.body.refreshToken; // current live tip

    // Reuse the oldest, already-revoked token (t0) — simulated theft.
    const reuse = await request(app).post('/api/auth/refresh').send({ refreshToken: t0 });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');

    // The legitimate, still-current tip (t2) must now ALSO be revoked as a result.
    const tipAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken: t2 });
    expect(tipAttempt.status).toBe(401);
    expect(tipAttempt.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects garbage refresh tokens', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'totally-bogus-token' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /auth/logout and /auth/logout-all', () => {
  it('logout revokes only the presented refresh token', async () => {
    const s = await signupFamily(app);

    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ refreshToken: s.refreshToken })
      .expect(204);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(401);
  });

  it('logout-all revokes every refresh token for the user', async () => {
    const s = await signupFamily(app);
    const r1 = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    const secondLiveToken = r1.body.refreshToken;

    await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(204);

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: secondLiveToken });
    expect(res.status).toBe(401);
  });
});

describe('GET/PATCH /auth/me', () => {
  it('returns the caller user/membership/family', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(s.user.email);
    expect(res.body.membership.isOwner).toBe(true);
    expect(res.body.family.id).toBe(s.family.id);
  });

  it('rejects missing/invalid bearer token with 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('updates name and avatarColor', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'New Name', avatarColor: '#123ABC' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');
    expect(res.body.user.avatarColor).toBe('#123ABC');
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and revokes existing refresh tokens', async () => {
    const s = await signupFamily(app);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ currentPassword: s.payload.password, newPassword: 'newpassword456' });
    expect(res.status).toBe(204);

    // Old refresh token is now dead.
    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(refreshRes.status).toBe(401);

    // New password logs in; old one doesn't.
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: s.payload.email, password: s.payload.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: s.payload.email, password: 'newpassword456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects wrong current password with 401 INVALID_CURRENT_PASSWORD', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ currentPassword: 'wrong', newPassword: 'newpassword456' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
  });
});

describe('POST /auth/reauth', () => {
  it('returns a reauthToken for the correct password', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/reauth')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ password: s.payload.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.reauthToken).toBe('string');
  });

  it('rejects the wrong password with 401 INVALID_CURRENT_PASSWORD', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/reauth')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CURRENT_PASSWORD');
  });
});
