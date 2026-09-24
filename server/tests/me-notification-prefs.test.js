import './helpers/setupEnv.js';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { startTestDb, stopTestDb, clearDb } from './helpers/db.js';
import { signupFamily } from './helpers/factory.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import meRoutes from '../src/modules/me/routes.js';

// `/api/me` isn't mounted in the shared app yet — its mount point (`app.use('/api/me',
// meRoutes)`) is a REQUESTED SHARED CHANGE for app.js (lead-owned; see this agent's final
// report). This test wires ONLY this module's own router into a throwaway Express app so the
// route itself is covered end-to-end without touching app.js.
function buildMeOnlyApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/me', meRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

// The rest of the app (signup/login) still needs the full app to create a real admin session —
// build that separately, purely to mint a valid access token.
let fullApp;
let meApp;

beforeAll(async () => {
  await startTestDb();
  const { buildApp } = await import('./helpers/factory.js');
  fullApp = buildApp();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await clearDb();
  meApp = buildMeOnlyApp();
});

describe('GET/PATCH /api/me/notification-prefs', () => {
  it('defaults to an empty instant-prefs object (everything on)', async () => {
    const s = await signupFamily(fullApp);
    const res = await request(meApp).get('/api/me/notification-prefs').set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ instant: {} });
  });

  it('merges a partial patch into the existing instant prefs', async () => {
    const s = await signupFamily(fullApp);

    const first = await request(meApp)
      .patch('/api/me/notification-prefs')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ instant: { member_added: false } });
    expect(first.status).toBe(200);
    expect(first.body.instant).toEqual({ member_added: false });

    const second = await request(meApp)
      .patch('/api/me/notification-prefs')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ instant: { share_lockout: false } });
    expect(second.status).toBe(200);
    // Merged, not replaced — member_added:false from the first patch survives.
    expect(second.body.instant).toEqual({ member_added: false, share_lockout: false });
  });

  it('rejects an empty body', async () => {
    const s = await signupFamily(fullApp);
    const res = await request(meApp)
      .patch('/api/me/notification-prefs')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({});
    expect(res.status).toBe(400);
  });

  it('is admin-only (403 for a non-admin member)', async () => {
    const s = await signupFamily(fullApp);
    await request(fullApp)
      .post('/api/members')
      .set('Authorization', `Bearer ${s.accessToken}`).set('X-Family-Id', s.familyId)
      .send({ name: 'Kid', email: 'kid-me-prefs@example.com', tempPassword: 'password123', access: 'read' })
      .expect(201);
    const memberLogin = await request(fullApp).post('/api/auth/login').send({ email: 'kid-me-prefs@example.com', password: 'password123' });

    const res = await request(meApp)
      .get('/api/me/notification-prefs')
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`)
      .set('X-Family-Id', s.familyId);
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(meApp).get('/api/me/notification-prefs');
    expect(res.status).toBe(401);
  });
});
