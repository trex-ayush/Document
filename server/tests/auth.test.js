import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, uniqueSignupBody, authed } from './helpers/factory.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { sha256Hex } from '../src/utils/crypto.js';

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

/** Only the fields POST /auth/signup actually accepts (multi-family dropped `familyName`). */
function signupBody(payload) {
  return { name: payload.name, email: payload.email, password: payload.password };
}

describe('POST /auth/signup', () => {
  it('creates ONLY the User — no family yet, memberships: []', async () => {
    const payload = uniqueSignupBody();
    const res = await request(app).post('/api/auth/signup').send(signupBody(payload));

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: payload.name, email: payload.email.toLowerCase() });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.memberships).toEqual([]);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('rejects a body that still sends familyName (dropped field) with 400 VALIDATION_ERROR', async () => {
    const payload = uniqueSignupBody();
    const res = await request(app).post('/api/auth/signup').send(payload); // payload still has familyName
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const payload = uniqueSignupBody();
    await request(app).post('/api/auth/signup').send(signupBody(payload)).expect(201);

    const other = uniqueSignupBody();
    const res = await request(app).post('/api/auth/signup').send(signupBody({ ...other, email: payload.email }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('auto-joins a pending invite left for this email BEFORE the account existed, activating it immediately', async () => {
    const admin = await signupFamily(app);
    const invited = 'pending-invite-signup@example.com';
    await authed(request(app).post('/api/members'), admin)
      .send({ name: 'Future Member', email: invited, access: 'read', sendInvite: true })
      .expect(201);

    const res = await request(app).post('/api/auth/signup').send({ name: 'Future Member', email: invited, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0]).toMatchObject({ familyId: admin.family.id, status: 'active', role: 'member' });
  });

  it('auto-joins EVERY matching pending invite across different families in one signup', async () => {
    const adminA = await signupFamily(app);
    const adminB = await signupFamily(app);
    const invited = 'double-invited@example.com';

    await authed(request(app).post('/api/members'), adminA)
      .send({ name: 'Double Invited', email: invited, access: 'read', sendInvite: true })
      .expect(201);
    await authed(request(app).post('/api/members'), adminB)
      .send({ name: 'Double Invited', email: invited, access: 'write', sendInvite: true })
      .expect(201);

    const res = await request(app).post('/api/auth/signup').send({ name: 'Double Invited', email: invited, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.memberships).toHaveLength(2);
    const familyIds = res.body.memberships.map((m) => m.familyId).sort();
    expect(familyIds).toEqual([adminA.family.id, adminB.family.id].sort());
    expect(res.body.memberships.every((m) => m.status === 'active')).toBe(true);
  });
});

describe('POST /family — cold-start onboarding', () => {
  it('a brand-new user with zero memberships can create their first family', async () => {
    const payload = uniqueSignupBody();
    const signupRes = await request(app).post('/api/auth/signup').send(signupBody(payload)).expect(201);
    expect(signupRes.body.memberships).toEqual([]);

    const familyRes = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
      .send({ familyName: 'Freshly Created Family' });
    expect(familyRes.status).toBe(201);
    expect(familyRes.body.family).toMatchObject({ name: 'Freshly Created Family' });
    expect(familyRes.body.membership).toMatchObject({ role: 'admin', access: 'write', isOwner: true, status: 'active' });

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signupRes.body.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.memberships).toHaveLength(1);
    expect(meRes.body.memberships[0].familyId).toBe(familyRes.body.family.id);
  });

  it('an existing user can create an ADDITIONAL family, ending up with 2 memberships', async () => {
    const s = await signupFamily(app);
    const secondRes = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ familyName: 'Second Family' });
    expect(secondRes.status).toBe(201);
    expect(secondRes.body.family.id).not.toBe(s.family.id);

    const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${s.accessToken}`);
    expect(meRes.body.memberships).toHaveLength(2);
    const ids = meRes.body.memberships.map((m) => m.familyId).sort();
    expect(ids).toEqual([s.family.id, secondRes.body.family.id].sort());
  });
});

describe('POST /auth/login', () => {
  it('logs in with correct credentials, returning the full active-membership list', async () => {
    const { payload, family } = await signupFamily(app);
    const res = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(payload.email.toLowerCase());
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].familyId).toBe(family.id);
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

  it('a user with zero memberships (never called POST /family) can still log in', async () => {
    const payload = uniqueSignupBody();
    await request(app).post('/api/auth/signup').send(signupBody(payload)).expect(201);

    const res = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([]);
  });

  it('auto-joins a pending invite on login (invited AFTER the account already existed)', async () => {
    const payload = uniqueSignupBody();
    await request(app).post('/api/auth/signup').send(signupBody(payload)).expect(201);

    const admin = await signupFamily(app);
    await authed(request(app).post('/api/members'), admin)
      .send({ name: payload.name, email: payload.email, access: 'read', sendInvite: true })
      .expect(201);

    const res = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password });
    expect(res.status).toBe(200);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0]).toMatchObject({ familyId: admin.family.id, status: 'active' });
  });

  it('disabling a member out of their only family no longer blocks login (per-family, not account-level)', async () => {
    const admin = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), admin)
      .send({ name: 'Kid', email: 'disabled-membership-login@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    await authed(request(app).patch(`/api/members/${create.body.id}`), admin).send({ status: 'disabled' }).expect(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'disabled-membership-login@example.com', password: 'password123' });
    expect(login.status).toBe(200);
    expect(login.body.memberships).toEqual([]); // that one family's membership is disabled, so it's excluded
  });
});

describe('refresh token rotation + reuse detection', () => {
  it('rotates the refresh token on every call and revokes the old one', async () => {
    const signupBody_ = await signupFamily(app);
    const first = signupBody_.refreshToken;

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
    const signupBody_ = await signupFamily(app);
    const t0 = signupBody_.refreshToken;

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

describe('session lock after 60 minutes of inactivity', () => {
  const HOUR = 60 * 60 * 1000;

  async function tokenRow(raw) {
    return RefreshToken.findOne({ tokenHash: sha256Hex(raw) });
  }

  it('issues refresh tokens that expire 60 minutes from now', async () => {
    const before = Date.now();
    const s = await signupFamily(app);
    const row = await tokenRow(s.refreshToken);
    const ms = row.expiresAt.getTime();
    expect(ms).toBeGreaterThanOrEqual(before + HOUR - 1000);
    expect(ms).toBeLessThanOrEqual(Date.now() + HOUR + 1000);
  });

  it('each refresh slides the expiry to 60 minutes from the refresh', async () => {
    const s = await signupFamily(app);
    // Pretend the session has been idle for 50 minutes: 10 minutes left on the token.
    await RefreshToken.updateOne(
      { tokenHash: sha256Hex(s.refreshToken) },
      { expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    );

    const r = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(r.status).toBe(200);
    const row = await tokenRow(r.body.refreshToken);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + HOUR - 60 * 1000);
  });

  it('rejects a refresh token left idle for over an hour with 401 SESSION_EXPIRED', async () => {
    const s = await signupFamily(app);
    await RefreshToken.updateOne({ tokenHash: sha256Hex(s.refreshToken) }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_EXPIRED');
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

  it('logout works without an access token (sign-out after the session went idle)', async () => {
    const s = await signupFamily(app);

    await request(app).post('/api/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);

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
  it('returns the caller user + full active-membership list, no X-Family-Id needed', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(s.user.email);
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0]).toMatchObject({
      familyId: s.family.id,
      familyName: s.family.name,
      isOwner: true,
      role: 'admin',
      status: 'active',
    });
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
  it('no longer exists (404) — signed-in members see their secrets without re-entering a password', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/reauth')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ password: s.payload.password });
    expect(res.status).toBe(404);
  });
});

describe('Global login-method enforcement (platform settings)', () => {
  it('blocks password signup/login with 403 LOGIN_METHOD_NOT_ALLOWED when set to "google"', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'google' }, { upsert: true });

    const payload = uniqueSignupBody();
    const signupRes = await request(app).post('/api/auth/signup').send(signupBody(payload));
    expect(signupRes.status).toBe(403);
    expect(signupRes.body.code).toBe('LOGIN_METHOD_NOT_ALLOWED');

    // An already-existing password account is also blocked from logging in.
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'both' }, { upsert: true });
    await request(app).post('/api/auth/signup').send(signupBody(payload)).expect(201);
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'google' }, { upsert: true });

    const loginRes = await request(app).post('/api/auth/login').send({ email: payload.email, password: payload.password });
    expect(loginRes.status).toBe(403);
    expect(loginRes.body.code).toBe('LOGIN_METHOD_NOT_ALLOWED');
  });

  it('allows both when set to "both" (default)', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'both' }, { upsert: true });
    const payload = uniqueSignupBody();
    const res = await request(app).post('/api/auth/signup').send(signupBody(payload));
    expect(res.status).toBe(201);
  });
});
