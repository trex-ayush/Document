import './helpers/setupEnv.js';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';
import { Membership } from '../src/models/Membership.js';

// Boundary mock: alerts.js calls `sendMail` from services/mailer.js — assert on recipients and
// subjects here, never on real SMTP delivery.
const mockSendMail = vi.fn();
vi.mock('../src/services/mailer.js', () => ({
  sendMail: (...args) => mockSendMail(...args),
  isEmailEnabled: () => false,
}));

const { _resetAlertStateForTests } = await import('../src/services/alerts.js');

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
  _resetAlertStateForTests();
});

function wait(ms = 250) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `onActivity()` runs fire-and-forget in the background (activityLogger.js never awaits it), and
 * bcryptjs (cost 12 — see docs/DECISIONS.md) is slow enough on a constrained sandbox CPU that a
 * fixed sleep is flaky for anything downstream of a password check. Poll instead: fast when the
 * background work is fast, still robust when it isn't.
 */
async function waitForMailCalls(min = 1, timeoutMs = 15000) {
  const start = Date.now();
  while (mockSendMail.mock.calls.length < min && Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function pngBuffer() {
  return sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 200, g: 60, b: 60 } } })
    .png()
    .toBuffer();
}

async function createFolder(auth, familyId, name = 'Docs') {
  const res = await request(app)
    .post('/api/folders')
    .set('Authorization', `Bearer ${auth}`)
    .set('X-Family-Id', familyId)
    .send({ name, parentId: 'root' });
  expect(res.status).toBe(201);
  return res.body;
}

async function createDocument(auth, familyId, folderId, title = 'A document') {
  const res = await request(app)
    .post('/api/documents')
    .set('Authorization', `Bearer ${auth}`)
    .set('X-Family-Id', familyId)
    .field('data', JSON.stringify({ title, folderId }))
    .field('labels', JSON.stringify(['Front']))
    .attach('files', await pngBuffer(), { filename: 'x.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return res.body;
}

describe('admin instant alerts — members', () => {
  it('emails the admin when a member is added', async () => {
    const s = await signupFamily(app);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-added@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ to: s.user.email });
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('member added');
  });

  it('does not email when the admin has turned that alert off', async () => {
    const s = await signupFamily(app);
    // `/api/me/notification-prefs` isn't mounted in the shared test app yet (its mount point is
    // a REQUESTED SHARED CHANGE for app.js — see this agent's final report; the route itself is
    // covered end-to-end in tests/me-notification-prefs.test.js). Set the pref directly here so
    // this test only exercises the alert-gating logic.
    await Membership.updateOne({ _id: s.membership.id }, { 'notificationPrefs.instant.member_added': false });

    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-noalert@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    await wait();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('emails the admin when a member is removed', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-removed@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);
    await wait();
    mockSendMail.mockReset(); // drop the "member added" email

    await request(app).delete(`/api/members/${create.body.id}`).set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).expect(204);
    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('member removed');
  });

  it('emails the admin when a member is disabled', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-disabled@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);
    await wait();
    mockSendMail.mockReset();

    await request(app)
      .patch(`/api/members/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ status: 'disabled' })
      .expect(200);
    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('member disabled');
  });

  it('does not email when a re-enable or an unrelated profile edit happens', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-profile@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);
    await wait();
    mockSendMail.mockReset();

    await request(app)
      .patch(`/api/members/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'New Name' })
      .expect(200);
    await wait();

    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('admin instant alerts — shares', () => {
  it('does not email when a share link is created', async () => {
    const s = await signupFamily(app);
    const folder = await createFolder(s.accessToken, s.familyId);

    await request(app)
      .post('/api/shares')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ targetType: 'folder', targetId: folder.id, duration: '24h' })
      .expect(201);
    await wait();

    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('admin instant alerts — deletes are batched', () => {
  it('sends ONE email for multiple document deletes within the debounce window', async () => {
    const s = await signupFamily(app);
    const folder = await createFolder(s.accessToken, s.familyId);
    const doc1 = await createDocument(s.accessToken, s.familyId, folder.id, 'Doc One');
    const doc2 = await createDocument(s.accessToken, s.familyId, folder.id, 'Doc Two');
    await wait();
    mockSendMail.mockReset(); // drop any storage-threshold noise from the creates

    await request(app).delete(`/api/documents/${doc1.id}`).set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).expect(204);
    await request(app).delete(`/api/documents/${doc2.id}`).set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).expect(204);

    // Debounce window is shortened under NODE_ENV=test (see alerts.js) — wait past it.
    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const email = mockSendMail.mock.calls[0][0];
    expect(email.subject.toLowerCase()).toContain('items deleted');
    expect(email.text).toContain('Doc One');
    expect(email.text).toContain('Doc Two');
    expect(email.text).toContain('2 documents were deleted');
  });

  it('uses singular grammar when only one document is deleted', async () => {
    const s = await signupFamily(app);
    const folder = await createFolder(s.accessToken, s.familyId);
    const doc = await createDocument(s.accessToken, s.familyId, folder.id, 'Lonely Doc');
    await wait();
    mockSendMail.mockReset();

    await request(app).delete(`/api/documents/${doc.id}`).set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId).expect(204);
    await waitForMailCalls(1);

    const email = mockSendMail.mock.calls[0][0];
    expect(email.text).toContain('Lonely Doc');
    expect(email.text).toContain('1 document was deleted');
  });
});

describe('admin instant alerts — login security', () => {
  it('emails the admin on a login from a device/browser not seen before', async () => {
    const s = await signupFamily(app);

    // First-ever login for this membership (signup already logged one `auth.login`-equivalent
    // via auth.signup, but there's no PRIOR `auth.login` to compare against) — establishes the
    // baseline, no alert yet.
    const login1 = await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Baseline Device)')
      .send({ email: s.payload.email, password: s.payload.password });
    expect(login1.status).toBe(200);
    await wait();
    mockSendMail.mockReset();

    const login2 = await request(app)
      .post('/api/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (A Totally Different Device)')
      .send({ email: s.payload.email, password: s.payload.password });
    expect(login2.status).toBe(200);
    // Positive assertion downstream of a background bcrypt-gated handler — poll like every other
    // "does email" case in this file (see waitForMailCalls's doc comment) instead of a fixed
    // sleep, which was flaky under concurrent sandbox load.
    await waitForMailCalls(1);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('new device');
  });

  it('does not email again for the exact same device/browser combo', async () => {
    const s = await signupFamily(app);
    const ua = 'Mozilla/5.0 (Same Device)';

    await request(app).post('/api/auth/login').set('User-Agent', ua).send({ email: s.payload.email, password: s.payload.password }).expect(200);
    await wait();
    mockSendMail.mockReset();

    await request(app).post('/api/auth/login').set('User-Agent', ua).send({ email: s.payload.email, password: s.payload.password }).expect(200);
    await wait();

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('emails the admin once 5 failed password attempts land on one account within 15 minutes', async () => {
    const s = await signupFamily(app);

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: 'totally-wrong-password' });
      expect(res.status).toBe(401);
    }
    await wait();

    const failedLoginEmail = mockSendMail.mock.calls.find((c) => c[0].subject.toLowerCase().includes('failed sign-in'));
    expect(failedLoginEmail).toBeTruthy();
  });
});
