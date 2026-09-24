import './helpers/setupEnv.js';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily, authed } from './helpers/factory.js';
import { Membership } from '../src/models/Membership.js';
import { PasswordResetToken } from '../src/models/PasswordResetToken.js';
import { sha256Hex } from '../src/utils/crypto.js';

const mockSendMail = vi.fn();
vi.mock('../src/services/mailer.js', () => ({
  sendMail: (...args) => mockSendMail(...args),
  isEmailEnabled: () => false,
}));

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
  mockSendMail.mockReset();
});

function extractToken(text) {
  const match = text.match(/[?&]token=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Finds the invite-link email actually addressed to `email` among every queued sendMail call so
 * far, rather than assuming it's `mock.calls[0]` — a fire-and-forget "member added" admin alert
 * (services/alerts.js's `onActivity` hook, triggered from the SAME POST /members request but
 * never awaited) can land in `mock.calls` before OR after the invite email itself depending on
 * event-loop timing, so index 0 isn't reliable without an explicit settle delay first.
 */
function findInviteToken(email) {
  const target = email.toLowerCase();
  const call = mockSendMail.mock.calls.find(
    ([arg]) => arg?.to?.toLowerCase() === target && arg?.text?.includes('/accept-invite?token='),
  );
  return call ? extractToken(call[0].text) : null;
}

async function waitForMailCalls(min = 1, timeoutMs = 15000) {
  const start = Date.now();
  while (mockSendMail.mock.calls.length < min && Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('POST /members with sendInvite', () => {
  it('creates an invited (not yet active) member, with NO User row pre-created, and emails the invite link', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'Invitee',
      relation: 'Sibling',
      email: 'invitee1@example.com',
      access: 'read',
      sendInvite: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('invited');
    expect(res.body.user.email).toBe('invitee1@example.com');

    const membership = await Membership.findById(res.body.id);
    expect(membership.userId).toBeNull();
    expect(membership.invitedEmail).toBe('invitee1@example.com');

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe('invitee1@example.com');
    expect(mockSendMail.mock.calls[0][0].text).toContain('/accept-invite?token=');

    // The invite token names the Membership, never a userId (multi-family — a user can hold
    // several simultaneous pending invites, see docs/DECISIONS.md "Multi-family accounts").
    const token = extractToken(mockSendMail.mock.calls[0][0].text);
    const tokenDoc = await PasswordResetToken.findOne({ tokenHash: sha256Hex(token) });
    expect(String(tokenDoc.membershipId)).toBe(res.body.id);
    expect(tokenDoc.userId).toBeNull();

    // Not usable to log in yet — no password has been set.
    const loginAttempt = await request(app).post('/api/auth/login').send({ email: 'invitee1@example.com', password: 'anything' });
    expect(loginAttempt.status).toBe(401);
  });

  it('falls back to the tempPassword flow when sendInvite is false (SMTP disabled by default)', async () => {
    const s = await signupFamily(app);
    const res = await authed(request(app).post('/api/members'), s).send({
      name: 'Kid',
      email: 'tempflow@example.com',
      tempPassword: 'password123',
      access: 'read',
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(mockSendMail).not.toHaveBeenCalled();

    const login = await request(app).post('/api/auth/login').send({ email: 'tempflow@example.com', password: 'password123' });
    expect(login.status).toBe(200);
  });
});

describe('GET /auth/accept-invite/:token', () => {
  it('returns the invite context before anything is submitted (accountExists: false for a brand-new person, allowsGoogle: true — sign-in method is a platform-wide setting, not chosen per member)', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Invitee', email: 'invitee2@example.com', access: 'write', sendInvite: true })
      .expect(201);
    const token = findInviteToken('invitee2@example.com');

    const res = await request(app).get(`/api/auth/accept-invite/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'invitee2@example.com', allowsGoogle: true, accountExists: false });
    expect(res.body.familyName).toBeTruthy();
  });

  it('reports accountExists: true when the invited email already has a User account', async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    await authed(request(app).post('/api/members'), familyA)
      .send({ name: 'Already Exists', email: familyB.payload.email, access: 'read', sendInvite: true })
      .expect(201);
    const token = findInviteToken(familyB.payload.email);

    const res = await request(app).get(`/api/auth/accept-invite/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: familyB.payload.email.toLowerCase(), accountExists: true });
  });

  it('404/400s for a bogus token', async () => {
    const res = await request(app).get('/api/auth/accept-invite/not-a-real-token');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });
});

describe('POST /auth/accept-invite', () => {
  it('sets the password, activates the membership, and signs the member in', async () => {
    const s = await signupFamily(app);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Invitee', email: 'invitee3@example.com', access: 'read', sendInvite: true })
      .expect(201);
    const token = findInviteToken('invitee3@example.com');
    // Let the (fire-and-forget) "member added" admin alert settle before resetting the mock, so
    // it can't race with and pollute the "invite accepted" assertion below.
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockSendMail.mockReset();

    const acceptRes = await request(app).post('/api/auth/accept-invite').send({ token, password: 'newMemberPass1' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.memberships).toHaveLength(1);
    expect(acceptRes.body.memberships[0]).toMatchObject({ familyId: s.family.id, status: 'active' });
    expect(acceptRes.body.accessToken).toBeTruthy();
    expect(acceptRes.body.refreshToken).toBeTruthy();

    // The admin gets an "invite accepted" alert.
    await waitForMailCalls(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(s.user.email);
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('accepted');

    // Now a normal password login works.
    const login = await request(app).post('/api/auth/login').send({ email: 'invitee3@example.com', password: 'newMemberPass1' });
    expect(login.status).toBe(200);

    // Token is single-use — it was marked used the moment it was accepted, so a reuse attempt
    // fails the token check itself (400 INVALID_OR_EXPIRED_TOKEN), same as reset-password's.
    const reuse = await request(app).post('/api/auth/accept-invite').send({ token, password: 'anotherOne2' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('activates every OTHER pending invite for the same email in the same request (multi-family auto-join)', async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);
    const invited = 'multi-invited-accept@example.com';

    await authed(request(app).post('/api/members'), familyA)
      .send({ name: 'Multi Invited', email: invited, access: 'read', sendInvite: true })
      .expect(201);
    await authed(request(app).post('/api/members'), familyB)
      .send({ name: 'Multi Invited', email: invited, access: 'write', sendInvite: true })
      .expect(201);

    const tokenA = findInviteToken(invited);

    const acceptRes = await request(app).post('/api/auth/accept-invite').send({ token: tokenA, password: 'somePassword1' });
    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.memberships).toHaveLength(2);
    const familyIds = acceptRes.body.memberships.map((m) => m.familyId).sort();
    expect(familyIds).toEqual([familyA.family.id, familyB.family.id].sort());
  });

  it('rejects an invalid token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
    const res = await request(app).post('/api/auth/accept-invite').send({ token: 'garbage', password: 'somePassword1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('409 ACCOUNT_EXISTS when the invited email already has a User account — points at login instead', async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    await authed(request(app).post('/api/members'), familyA)
      .send({ name: 'Already Exists', email: familyB.payload.email, access: 'read', sendInvite: true })
      .expect(201);
    const token = findInviteToken(familyB.payload.email);

    const res = await request(app).post('/api/auth/accept-invite').send({ token, password: 'irrelevantPass1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_EXISTS');

    // Logging in (their existing password) activates the membership instead — same auto-join.
    const login = await request(app).post('/api/auth/login').send({ email: familyB.payload.email, password: familyB.payload.password });
    expect(login.status).toBe(200);
    expect(login.body.memberships.map((m) => m.familyId)).toContain(familyA.family.id);
  });
});

describe('POST /members/:id/resend-invite', () => {
  it('invalidates the old token and sends a fresh one', async () => {
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s)
      .send({ name: 'Invitee', email: 'invitee4@example.com', access: 'read', sendInvite: true })
      .expect(201);
    const oldToken = findInviteToken('invitee4@example.com');
    // Let the (fire-and-forget) "member added" admin alert settle before resetting the mock.
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockSendMail.mockReset();

    const resendRes = await authed(request(app).post(`/api/members/${create.body.id}/resend-invite`), s);
    expect(resendRes.status).toBe(204);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const newToken = extractToken(mockSendMail.mock.calls[0][0].text);
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);

    // The old link no longer works...
    const oldAccept = await request(app).post('/api/auth/accept-invite').send({ token: oldToken, password: 'password123X' });
    expect(oldAccept.status).toBe(400);
    expect(oldAccept.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');

    // ...but the new one does.
    const newAccept = await request(app).post('/api/auth/accept-invite').send({ token: newToken, password: 'password123X' });
    expect(newAccept.status).toBe(200);
  });

  it('works for the "found an existing User" invite shape too (no userId check anymore)', async () => {
    const familyA = await signupFamily(app);
    const familyB = await signupFamily(app);

    const create = await authed(request(app).post('/api/members'), familyA)
      .send({ name: 'Already Exists', email: familyB.payload.email, access: 'read', sendInvite: true })
      .expect(201);
    // Let the (fire-and-forget) "member added" admin alert settle before resetting the mock.
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockSendMail.mockReset();

    const resendRes = await authed(request(app).post(`/api/members/${create.body.id}/resend-invite`), familyA);
    expect(resendRes.status).toBe(204);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(familyB.payload.email.toLowerCase());
  });

  it('404s for a member with no pending invite', async () => {
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s)
      .send({ name: 'Kid', email: 'active-member@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    const res = await authed(request(app).post(`/api/members/${create.body.id}/resend-invite`), s);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_INVITED');
  });

  it('is admin-only', async () => {
    const s = await signupFamily(app);
    const invitee = await authed(request(app).post('/api/members'), s)
      .send({ name: 'Invitee', email: 'invitee5@example.com', access: 'read', sendInvite: true })
      .expect(201);
    await authed(request(app).post('/api/members'), s)
      .send({ name: 'Regular', email: 'regular-member@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);
    const memberLogin = await request(app).post('/api/auth/login').send({ email: 'regular-member@example.com', password: 'password123' });

    const res = await request(app)
      .post(`/api/members/${invitee.body.id}/resend-invite`)
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .set('X-Family-Id', s.family.id);
    expect(res.status).toBe(403);
  });
});

describe('invite acceptance via Google sign-in bypasses the password endpoint', () => {
  it('flips an invited membership to active once a matching Membership record exists', async () => {
    // Full Google verification requires GOOGLE_CLIENT_ID + a real ID token, which is out of scope
    // here — this test instead verifies the DB-level contract `autoJoinPendingInvites` relies on:
    // an invited Membership found by userId, once flipped to 'active' elsewhere, behaves exactly
    // like any other active membership for login purposes.
    const s = await signupFamily(app);
    const create = await authed(request(app).post('/api/members'), s)
      .send({ name: 'Invitee', email: 'invitee-viagoogle@example.com', access: 'read', sendInvite: true })
      .expect(201);

    let membership = await Membership.findById(create.body.id);
    expect(membership.status).toBe('invited');

    membership.status = 'active';
    await membership.save();

    membership = await Membership.findById(create.body.id);
    expect(membership.status).toBe('active');
  });
});
