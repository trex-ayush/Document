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

describe('document-types CRUD', () => {
  it('GET lists the 11 seeded defaults', async () => {
    const s = await signupFamily(app);
    const res = await request(app).get('/api/document-types').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(11);
  });

  it('admin can create, patch and delete a custom type', async () => {
    const s = await signupFamily(app);

    const create = await request(app)
      .post('/api/document-types')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Insurance Policy', icon: 'shield', fields: [{ key: 'Policy Number', sensitive: true }] });
    expect(create.status).toBe(201);
    expect(create.body.fields[0]).toMatchObject({ key: 'Policy Number', sensitive: true, type: 'text' });

    const patch = await request(app)
      .patch(`/api/document-types/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Insurance Policy (Life)' });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe('Insurance Policy (Life)');

    await request(app)
      .delete(`/api/document-types/${create.body.id}`)
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .expect(204);

    const list = await request(app).get('/api/document-types').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId);
    expect(list.body.items.find((t) => t.id === create.body.id)).toBeUndefined();
  });

  it('non-admin cannot create/patch/delete (403)', async () => {
    const s = await signupFamily(app);
    await request(app)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Member', email: 'dttest@example.com', tempPassword: 'password123', access: 'write' })
      .expect(201);
    const login = await request(app).post('/api/auth/login').send({ email: 'dttest@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/document-types')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('X-Family-Id', s.familyId)
      .send({ name: 'Should Fail' });
    expect(res.status).toBe(403);
  });

  it('404s for an unknown id', async () => {
    const s = await signupFamily(app);
    const res = await request(app)
      .patch('/api/document-types/000000000000000000000000')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Nope' });
    expect(res.status).toBe(404);
  });
});
