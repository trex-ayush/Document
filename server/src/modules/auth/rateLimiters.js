import { rateLimit } from 'express-rate-limit';
import { isTest } from '../../config/env.js';

// Stricter than app.js's app-wide /api/auth limiter (20/15min) for the specific
// credential-guessing/brute-force surfaces. Disabled under NODE_ENV=test so test suites that
// exercise many signup/login calls in one file don't trip 429s against each other.

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

// POST /auth/set-password — already-authenticated, so keyed per user.
export const setPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId || req.ip,
  skip: () => isTest,
  message: { message: 'Too many attempts — please try again later', code: 'RATE_LIMITED' },
});

// Same posture (windowMs/limit) as loginLimiter, for the public/credential-guessing Google
// routes (POST /auth/google, POST /auth/google/complete) — keyed by IP only since the request
// body carries an opaque ID token rather than an email to key on.
export const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  skip: () => isTest,
  message: { message: 'Too many Google sign-in attempts — please try again later', code: 'RATE_LIMITED' },
});

// Email module: forgot-password is a credential-guessing-adjacent surface (an attacker could
// otherwise mail-bomb an arbitrary inbox or brute-force account existence via response timing),
// so it's rate limited per IP+email same as loginKey above — stricter limit since a legitimate
// user essentially never needs more than a couple of reset emails in 15 minutes.
function emailKey(req) {
  const email = (req.body?.email || '').toLowerCase().trim();
  return `${req.ip}:${email || 'unknown'}`;
}

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: emailKey,
  skip: () => isTest,
  message: { message: 'Too many password reset requests — please try again later', code: 'RATE_LIMITED' },
});
