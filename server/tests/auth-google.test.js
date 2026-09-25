// Import order matters here: this MUST be the very first import so GOOGLE_CLIENT_ID lands in
// process.env before config/env.js's eager parse (triggered transitively below, by
// helpers/factory.js -> src/app.js). See helpers/setupGoogleEnv.js for the full explanation.
import './helpers/setupGoogleEnv.js';
import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { OAuth2Client } from 'google-auth-library';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { User } from '../src/models/User.js';
import { Folder } from '../src/models/Folder.js';
import { PlatformSettings } from '../src/models/PlatformSettings.js';

let app;
let verifySpy;

/** A plausible Google ID token payload, as `OAuth2Client#verifyIdToken().getPayload()` returns it. */
function googlePayload(overrides = {}) {
  return {
    sub: 'google-sub-default',
    email: 'default-googler@example.com',
    email_verified: true,
    name: 'Default Googler',
    picture: 'https://example.com/avatar.png',
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/** Queue the payload the NEXT verifyIdToken() call resolves with (one call = one queued payload). */
function mockNextVerify(payload) {
  verifySpy.mockResolvedValueOnce({ getPayload: () => payload });
}

beforeAll(async () => {
  await startTestDb();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  app = buildApp();
  await clearDb();
  verifySpy = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /auth/google', () => {
  it('returns needsSignup for a brand-new Google identity; /auth/google/complete then creates the User (no family, multi-family); a second Google sign-in with the same sub logs straight in', async () => {
    mockNextVerify(googlePayload({ sub: 'sub-new-1', email: 'newgoogle@example.com', name: 'New Googler' }));

    const first = await request(app).post('/api/auth/google').send({ credential: 'fake-credential' });
    expect(first.status).toBe(200);
    expect(first.body.needsSignup).toBe(true);
    expect(typeof first.body.signupToken).toBe('string');
    expect(first.body.profile).toMatchObject({ name: 'New Googler', email: 'newgoogle@example.com' });

    const complete = await request(app).post('/api/auth/google/complete').send({ signupToken: first.body.signupToken });
    expect(complete.status).toBe(201);
    expect(complete.body.user.email).toBe('newgoogle@example.com');
    expect(complete.body.user.passwordHash).toBeUndefined();
    expect(complete.body.memberships).toEqual([]); // multi-family: cold — no family created here anymore
    expect(typeof complete.body.accessToken).toBe('string');
    expect(typeof complete.body.refreshToken).toBe('string');

    // POST /family works the same way it would after a password signup.
    const familyRes = await request(app)
      .post('/api/family')
      .set('Authorization', `Bearer ${complete.body.accessToken}`)
      .send({ familyName: 'The New Family' });
    expect(familyRes.status).toBe(201);
    expect(familyRes.body.membership).toMatchObject({ role: 'admin', access: 'write', isOwner: true, status: 'active' });
    expect(familyRes.body.family.name).toBe('The New Family');

    // seeded defaults (the Shared folder) exist, exactly like after a password signup
    const shared = await Folder.find({ familyId: familyRes.body.family.id, isSystem: true }).lean();
    expect(shared.map((f) => f.name)).toEqual(['Shared']);

    // login via existing googleId: same sub, no email-matching needed
    mockNextVerify(googlePayload({ sub: 'sub-new-1', email: 'newgoogle@example.com' }));
    const second = await request(app).post('/api/auth/google').send({ credential: 'fake-credential-2' });
    expect(second.status).toBe(200);
    expect(second.body.needsSignup).toBe(false);
    expect(second.body.user.email).toBe('newgoogle@example.com');
    expect(typeof second.body.accessToken).toBe('string');
    expect(second.body.memberships).toHaveLength(1);
  });

  it('rejects an unverified Google email with 401 GOOGLE_EMAIL_NOT_VERIFIED', async () => {
    mockNextVerify(googlePayload({ email_verified: false }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('GOOGLE_EMAIL_NOT_VERIFIED');
  });

  it('links an existing password account on first Google login by matching email, keeping their SAME existing memberships', async () => {
    const s = await signupFamily(app);
    mockNextVerify(googlePayload({ sub: 'sub-link-1', email: s.payload.email }));

    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.needsSignup).toBe(false);
    expect(res.body.user.email).toBe(s.payload.email.toLowerCase());
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].familyId).toBe(s.family.id);

    // authProviders now includes both — password login for the same account still works too
    expect(res.body.user.authProviders).toEqual(expect.arrayContaining(['password', 'google']));
    const pwLogin = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: s.payload.password });
    expect(pwLogin.status).toBe(200);
  });

  it('does NOT auto-join an existing family for an email that is not already a member anywhere — only needsSignup -> complete creates anything', async () => {
    await signupFamily(app); // an unrelated family already exists
    mockNextVerify(googlePayload({ sub: 'sub-fresh-1', email: 'totally-new@example.com' }));

    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.needsSignup).toBe(true);

    const usersWithThatEmail = await User.find({ email: 'totally-new@example.com' });
    expect(usersWithThatEmail).toHaveLength(0);
  });

  it('blocks Google login when the underlying User is disabled, same as password login', async () => {
    const s = await signupFamily(app);
    mockNextVerify(googlePayload({ sub: 'sub-disabled-user', email: s.payload.email }));
    await request(app).post('/api/auth/google').send({ credential: 'x' }).expect(200); // links first

    await User.updateOne({ email: s.payload.email.toLowerCase() }, { disabled: true });

    mockNextVerify(googlePayload({ sub: 'sub-disabled-user', email: s.payload.email }));
    const googleRes = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(googleRes.status).toBe(403);
    expect(googleRes.body.code).toBe('ACCOUNT_DISABLED');

    // password login for the same user is blocked identically
    const pwRes = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: s.payload.password });
    expect(pwRes.status).toBe(403);
    expect(pwRes.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('a disabled MEMBERSHIP (not the account) no longer blocks Google login — multi-family, per-family only', async () => {
    const s = await signupFamily(app);
    const createRes = await authed(request(app).post('/api/members'), s).send({
      name: 'Google Kid',
      email: 'googlekid@example.com',
      access: 'read',
      tempPassword: 'tempPass123',
    });
    expect(createRes.status).toBe(201);

    await authed(request(app).patch(`/api/members/${createRes.body.id}`), s).send({ status: 'disabled' }).expect(200);

    mockNextVerify(googlePayload({ sub: 'sub-disabled-member', email: 'googlekid@example.com' }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([]);
  });
});

describe('Google link/unlink endpoints were removed', () => {
  it('POST /auth/google/link and /auth/google/unlink no longer exist (404)', async () => {
    const s = await signupFamily(app);
    const link = await request(app)
      .post('/api/auth/google/link')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ credential: 'x' });
    expect(link.status).toBe(404);
    const unlink = await request(app).post('/api/auth/google/unlink').set('Authorization', `Bearer ${s.accessToken}`);
    expect(unlink.status).toBe(404);
  });
});

describe('POST /auth/set-password', () => {
  it('lets a Google-only user add a first password without re-entering anything, enabling password login', async () => {
    mockNextVerify(googlePayload({ sub: 'sub-setpw-2', email: 'setpw2@example.com' }));
    const first = await request(app).post('/api/auth/google').send({ credential: 'x' });
    const complete = await request(app).post('/api/auth/google/complete').send({ signupToken: first.body.signupToken });

    const setRes = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${complete.body.accessToken}`)
      .send({ newPassword: 'brandNewPass123' });
    expect(setRes.status).toBe(204);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'setpw2@example.com', password: 'brandNewPass123' });
    expect(loginRes.status).toBe(200);
  });

  it('refuses to replace an existing password (409 PASSWORD_ALREADY_SET — use change-password)', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/auth/set-password')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ newPassword: 'brandNewPass123' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PASSWORD_ALREADY_SET');

    const oldLogin = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: s.payload.password });
    expect(oldLogin.status).toBe(200);
  });

  it('requires a signed-in session (401)', async () => {
    const res = await request(app).post('/api/auth/set-password').send({ newPassword: 'brandNewPass123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /members — sign-in method is not a per-member admin choice', () => {
  it('member creation without tempPassword is an invite (they pick password or Google when joining)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'Invited Member',
      email: 'invitedmember@example.com',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('invited');
    expect(res.body.invite.url).toContain('/accept-invite?token=');

    const token = new URL(res.body.invite.url).searchParams.get('token');
    const ctx = await request(app).get(`/api/auth/accept-invite/${token}`);
    expect(ctx.status).toBe(200);
    expect(ctx.body.allowsGoogle).toBe(true);
  });

  it('creates a member with tempPassword, allowing password login AND later Google linking', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'New Member',
      email: 'newmember@example.com',
      tempPassword: 'tempPass123',
      access: 'read',
    });
    expect(res.status).toBe(201);

    const pwLogin = await request(app).post('/api/auth/login').send({ email: 'newmember@example.com', password: 'tempPass123' });
    expect(pwLogin.status).toBe(200);

    mockNextVerify(googlePayload({ sub: 'sub-new-member', email: 'newmember@example.com' }));
    const googleLogin = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(googleLogin.status).toBe(200);
    expect(googleLogin.body.needsSignup).toBe(false);
  });
});

describe('Global login-method enforcement (platform settings) — Google paths', () => {
  it('blocks POST /auth/google and /auth/google/complete with 403 LOGIN_METHOD_NOT_ALLOWED when set to "password"', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'password' }, { upsert: true });

    mockNextVerify(googlePayload({ sub: 'sub-blocked-1', email: 'blocked-google@example.com' }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('LOGIN_METHOD_NOT_ALLOWED');

    const completeRes = await request(app).post('/api/auth/google/complete').send({ signupToken: 'irrelevant-would-fail-anyway' });
    expect(completeRes.status).toBe(403);
    expect(completeRes.body.code).toBe('LOGIN_METHOD_NOT_ALLOWED');
  });

  it('allows Google sign-in when set to "both" (default)', async () => {
    await PlatformSettings.findByIdAndUpdate('platform', { allowedLoginMethods: 'both' }, { upsert: true });
    mockNextVerify(googlePayload({ sub: 'sub-allowed-1', email: 'allowed-google@example.com' }));
    const res = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.needsSignup).toBe(true);
  });
});
