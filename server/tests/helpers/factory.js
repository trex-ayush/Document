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

/** Signs up a brand-new family and returns { app, body, accessToken, refreshToken, ... }. */
export async function signupFamily(app, overrides = {}) {
  const payload = uniqueSignupBody(overrides);
  const res = await request(app).post('/api/auth/signup').send(payload);
  if (res.status !== 201) {
    throw new Error(`signupFamily failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { payload, ...res.body };
}
