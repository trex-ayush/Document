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

describe('GET /members', () => {
  it('lists the owner membership with user.email', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/members').set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].isOwner).toBe(true);
    expect(res.body.items[0].user.email).toBe(s.user.email);
  });
});

describe('POST /members', () => {
  it('admin can create a login-enabled member', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Kid One', relation: 'Child', email: 'kid1@example.com', tempPassword: 'tempPass123', access: 'read' });

    expect(res.status).toBe(201);
    expect(res.body.canLogin).toBe(true);
    expect(res.body.user.email).toBe('kid1@example.com');
    expect(res.body.role).toBe('member');
    expect(res.body.isOwner).toBe(false);

    // the created member can log in
    const login = await request(app).post('/api/auth/login').send({ email: 'kid1@example.com', password: 'tempPass123' });
    expect(login.status).toBe(200);
  });

  it('admin can create a profile-only (canLogin:false) member', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Grandma', relation: 'Grandmother', canLogin: false });

    expect(res.status).toBe(201);
    expect(res.body.canLogin).toBe(false);
    expect(res.body.user).toBeUndefined();
  });

  it('rejects login-enabled creation missing email/tempPassword/access with 400', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Incomplete' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
    const s = await signupFamily(app);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'A', email: 'dup@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'B', email: 'dup@example.com', tempPassword: 'password123', access: 'read' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('a non-admin member cannot create members (403)', async () => {
    const s = await signupFamily(app);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Member', email: 'member1@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);

    const memberLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'member1@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .send({ name: 'Another', email: 'x@example.com', tempPassword: 'password123', access: 'read' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /members/:id', () => {
  it('disabling a member immediately revokes their refresh tokens', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Kid', email: 'kid2@example.com', tempPassword: 'password123', access: 'read' });

    const login = await request(app).post('/api/auth/login').send({ email: 'kid2@example.com', password: 'password123' });
    expect(login.status).toBe(200);

    await request(app)
      .patch(`/api/members/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ status: 'disabled' })
      .expect(200);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refreshRes.status).toBe(401);

    const loginAgain = await request(app).post('/api/auth/login').send({ email: 'kid2@example.com', password: 'password123' });
    expect(loginAgain.status).toBe(403);
    expect(loginAgain.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('cannot disable the owner membership (400 CANNOT_REMOVE_OWNER)', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch(`/api/members/${s.membership.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ status: 'disabled' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_REMOVE_OWNER');
  });
});

describe('POST /members/:id/reset-password', () => {
  it('resets the password and revokes existing refresh tokens', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Kid', email: 'kid3@example.com', tempPassword: 'password123', access: 'read' });
    const login = await request(app).post('/api/auth/login').send({ email: 'kid3@example.com', password: 'password123' });

    await request(app)
      .post(`/api/members/${create.body.id}/reset-password`)
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ newPassword: 'brandnewpass1' })
      .expect(204);

    const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refreshRes.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email: 'kid3@example.com', password: 'brandnewpass1' });
    expect(newLogin.status).toBe(200);
  });
});

describe('DELETE /members/:id', () => {
  it('removes a non-owner member', async () => {
    const s = await signupFamily(app);
    const create = await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ name: 'Kid', email: 'kid4@example.com', tempPassword: 'password123', access: 'read' });

    await request(app)
      .delete(`/api/members/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(204);

    const listRes = await request(app).get('/api/members').set('Authorization', `Bearer ${s.accessToken}`);
    expect(listRes.body.items.find((m) => m.id === create.body.id)).toBeUndefined();
  });

  it('cannot remove the owner membership (400 CANNOT_REMOVE_OWNER)', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .delete(`/api/members/${s.membership.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_REMOVE_OWNER');
  });
});
