import { rateLimit } from 'express-rate-limit';
import { isTest } from '../../config/env.js';

// Stricter than app.js's app-wide /api/auth limiter (20/15min) for the specific
// credential-guessing/brute-force surfaces. Disabled under NODE_ENV=test so test suites that
// exercise many signup/login/reauth calls in one file don't trip 429s against each other.

function loginKey(req) {
  const email = (req.body?.email || '').toLowerCase().trim();
  return `${req.ip}:${email || 'unknown'}`;
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginKey,
  skip: () => isTest,
  message: { message: 'Too many login attempts — please try again later', code: 'RATE_LIMITED' },
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { message: 'Too many signups from this network — please try again later', code: 'RATE_LIMITED' },
});

export const reauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId || req.ip,
  skip: () => isTest,
  message: { message: 'Too many re-authentication attempts — please try again later', code: 'RATE_LIMITED' },
});
