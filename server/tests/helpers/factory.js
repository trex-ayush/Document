import './setupEnv.js';
import request from 'supertest';
import { createApp } from '../../src/app.js';

export function buildApp() {
  return createApp();
}

let counter = 0;
/** Unique email/family name per call so parallel tests never collide. */
export function uniqueSignupBody(overrides = {}) {
  counter += 1;
  return {
    familyName: `Test Family ${counter}`,
    name: `Owner ${counter}`,
    email: `owner${counter}-${Date.now()}@example.com`,
    password: 'password123',
    ...overrides,
  };
}

/**
 * Multi-family sessions (docs/API.md "Multi-family sessions"): `POST /auth/signup` no longer
 * creates a family inline — it only creates the User (`{ user, memberships: [], accessToken,
 * refreshToken }`). Every test that needs a ready-to-use family now does the same two calls a
 * real "Create your family" onboarding step would: sign up, then `POST /family { familyName }`
 * (family-agnostic — `Authorization` only, no `X-Family-Id` needed for that one call).
 *
 * Returns the OLD flat shape every existing caller already destructures (`payload`, `user`,
 * `accessToken`, `refreshToken`, `family`, `membership`) PLUS what every family-scoped request
 * now additionally needs: `familyId` (send as the `X-Family-Id` header) and `memberships`.
 */
export async function signupFamily(app, overrides = {}) {
  const payload = uniqueSignupBody(overrides);
  const signupRes = await request(app)
    .post('/api/auth/signup')
    .send({ name: payload.name, email: payload.email, password: payload.password });
  if (signupRes.status !== 201) {
    throw new Error(`signupFamily: signup failed: ${signupRes.status} ${JSON.stringify(signupRes.body)}`);
  }

  const familyRes = await request(app)
    .post('/api/family')
    .set('Authorization', `Bearer ${signupRes.body.accessToken}`)
    .send({ familyName: payload.familyName });
  if (familyRes.status !== 201) {
    throw new Error(`signupFamily: family create failed: ${familyRes.status} ${JSON.stringify(familyRes.body)}`);
  }

  return {
    payload,
    user: signupRes.body.user,
    accessToken: signupRes.body.accessToken,
    refreshToken: signupRes.body.refreshToken,
    family: familyRes.body.family,
    membership: familyRes.body.membership,
    familyId: familyRes.body.family.id,
    memberships: [familyRes.body.membership],
  };
}

/**
 * Convenience for a request to a family-scoped endpoint: sets both headers this model now
 * requires (`Authorization` + `X-Family-Id`) in one call, e.g.
 *   authed(request(app).get('/api/folders/tree'), s).expect(200)
 * `familyId` defaults to the session's own family but can be overridden (e.g. to assert
 * NOT_A_MEMBER against a family the caller doesn't belong to).
 */
export function authed(req, session, familyId = session.familyId) {
  return req.set('Authorization', `Bearer ${session.accessToken}`).set('X-Family-Id', familyId);
}
