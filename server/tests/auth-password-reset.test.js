import './helpers/setupEnv.js';
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { buildApp, signupFamily } from './helpers/factory.js';
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

describe('POST /auth/forgot-password', () => {
  it('always responds 200 with the same generic message for a real account', async () => {
    const s = await signupFamily(app);
    const res = await request(app).post('/api/auth/forgot-password').send({ email: s.payload.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it('responds identically (200, same message) for an email that does not exist', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it('sends a reset email for a real, active account', async () => {
    const s = await signupFamily(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.payload.email }).expect(200);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(s.payload.email);
    expect(mockSendMail.mock.calls[0][0].text).toContain('/reset-password?token=');
  });

  it('never sends an email for an unknown address', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'nobody-here-either@example.com' }).expect(200);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('never sends an email for a disabled member', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Kid', email: 'kid-disabled-fp@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);
    await request(app)
      .patch(`/api/members/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ status: 'disabled' })
      .expect(200);
    // Let the (fire-and-forget) "member disabled" admin alert settle before resetting the mock,
    // so it can't race with and pollute the forgot-password assertion below.
    await new Promise((resolve) => setTimeout(resolve, 300));
    mockSendMail.mockReset();

    await request(app).post('/api/auth/forgot-password').send({ email: 'kid-disabled-fp@example.com' }).expect(200);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('POST /auth/reset-password', () => {
  it('sets the new password, single-uses the token, and revokes every refresh token', async () => {
    const s = await signupFamily(app);
    // A second session, to prove reset-password logs out EVERY device, not just the current one.
    const secondLogin = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: s.payload.password });
    expect(secondLogin.status).toBe(200);

    await request(app).post('/api/auth/forgot-password').send({ email: s.payload.email }).expect(200);
    const token = extractToken(mockSendMail.mock.calls[0][0].text);
    expect(token).toBeTruthy();

    const resetRes = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandNewPass1' });
    expect(resetRes.status).toBe(204);

    // Old password no longer works.
    const oldLogin = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: s.payload.password });
    expect(oldLogin.status).toBe(401);

    // New password works.
    const newLogin = await request(app).post('/api/auth/login').send({ email: s.payload.email, password: 'brandNewPass1' });
    expect(newLogin.status).toBe(200);

    // Both the original signup session AND the second login session are revoked.
    const refresh1 = await request(app).post('/api/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(refresh1.status).toBe(401);
    const refresh2 = await request(app).post('/api/auth/refresh').send({ refreshToken: secondLogin.body.refreshToken });
    expect(refresh2.status).toBe(401);

    // The token can't be used again.
    const reuse = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'anotherPass2' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('sends a "password changed" confirmation email', async () => {
    const s = await signupFamily(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.payload.email }).expect(200);
    const token = extractToken(mockSendMail.mock.calls[0][0].text);
    mockSendMail.mockReset();

    await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandNewPass1' }).expect(204);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe(s.payload.email);
    expect(mockSendMail.mock.calls[0][0].subject.toLowerCase()).toContain('password was changed');
  });

  it('rejects an expired token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
    const s = await signupFamily(app);
    await request(app).post('/api/auth/forgot-password').send({ email: s.payload.email }).expect(200);
    const token = extractToken(mockSendMail.mock.calls[0][0].text);

    await PasswordResetToken.updateOne({ tokenHash: sha256Hex(token) }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'brandNewPass1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('rejects a garbage token with 400 INVALID_OR_EXPIRED_TOKEN', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'not-a-real-token', newPassword: 'brandNewPass1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_OR_EXPIRED_TOKEN');
  });
});
