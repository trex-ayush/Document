import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../../middleware/errorHandler.js';

/**
 * Google Identity Services (GIS) ID-token flow — server-side verification only, no OAuth
 * redirect/consent dance, no client secret involved. See docs/DECISIONS.md "Google sign-in".
 *
 * GOOGLE_CLIENT_ID is optional; unset means the feature is off end-to-end (client hides the
 * button, every /auth/google* route responds 501 before touching Google or the DB — see
 * `assertGoogleEnabled` below, called first by every caller in googleService.js/service.js).
 *
 * This file is deliberately low-level (no User/Membership/service imports) so the service
 * modules can import from it without a circular dependency.
 */

const SIGNUP_TOKEN_TTL = '10m';
const SIGNUP_TOKEN_PURPOSE = 'google-signup';

let cachedClient = null;
function getClient() {
  // Constructed lazily (not at module load) so importing this file never throws when
  // GOOGLE_CLIENT_ID is blank in dev/test — every exported function below calls
  // assertGoogleEnabled() before this is ever reached.
  if (!cachedClient) cachedClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return cachedClient;
}

export function assertGoogleEnabled() {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new ApiError(501, 'GOOGLE_SIGNIN_DISABLED', 'Google sign-in is not configured on this server');
  }
}

/**
 * Verify a GIS ID token (the `credential` the client's Google button hands back) and return
 * Google's decoded payload. Requires a verified email — callers never see an unverified one.
 */
export async function verifyGoogleCredential(credential) {
  assertGoogleEnabled();

  let ticket;
  try {
    ticket = await getClient().verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
  } catch {
    throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Invalid or expired Google credential');
  }

  const payload = ticket.getPayload();
  if (!payload) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID', 'Invalid or expired Google credential');
  if (payload.email_verified !== true) {
    throw new ApiError(401, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Google account email is not verified');
  }
  return payload;
}

/**
 * A short-lived (10 min) capability minted after Google verification but before any account
 * exists, carrying just enough of the verified profile for POST /auth/google/complete to create
 * one. Signed with the existing JWT_ACCESS_SECRET (no new secret) and scoped by `purpose` so it's
 * never mistaken for/accepted as any other token kind.
 */
export function signGoogleSignupToken({ email, name, avatarUrl, sub }) {
  return jwt.sign(
    { email, name, avatarUrl, sub, purpose: SIGNUP_TOKEN_PURPOSE },
    env.JWT_ACCESS_SECRET,
    { expiresIn: SIGNUP_TOKEN_TTL },
  );
}

export function verifyGoogleSignupToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch {
    throw new ApiError(401, 'SIGNUP_TOKEN_INVALID', 'Signup token is invalid or expired');
  }
  if (payload.purpose !== SIGNUP_TOKEN_PURPOSE) {
    throw new ApiError(401, 'SIGNUP_TOKEN_INVALID', 'Signup token is invalid or expired');
  }
  return payload;
}
