import { RefreshToken } from '../../models/RefreshToken.js';
import { User } from '../../models/User.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { generateOpaqueToken, sha256Hex, hashIp } from '../../utils/crypto.js';
import { signAccessToken } from '../../utils/tokens.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, matches docs/API.md

function addRefreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

/**
 * Issue a brand-new (access, refresh) pair for a just-authenticated session (signup/login).
 *
 * Multi-family (docs/DECISIONS.md "Multi-family accounts"): both tokens are now purely
 * user-scoped — no `familyId`/`membershipId`/`role`/`access` baked into either one. "Which
 * family" is resolved fresh on every request from the `X-Family-Id` header (see
 * middleware/auth.js). This also means a session survives being added to / removed from a
 * family, or a role/access change, without needing a fresh login.
 */
export async function issueTokenPair({ userId, userAgent, ip }) {
  const raw = generateOpaqueToken();
  await RefreshToken.create({
    userId,
    tokenHash: sha256Hex(raw),
    expiresAt: addRefreshExpiry(),
    userAgent: (userAgent || '').slice(0, 300),
    ipHash: hashIp(ip),
  });
  const accessToken = signAccessToken({ userId });
  return { accessToken, refreshToken: raw };
}

/**
 * Verify + rotate a presented refresh token.
 *
 * Theft detection: reuse of an already-revoked token means someone (attacker or the legitimate
 * client after a race) presented a token that was already exchanged for a newer one. Every
 * rotation revokes the token it replaces, so by construction every node in a lineage EXCEPT the
 * current tip is already revoked — the only thing reuse can still hijack is that tip. We walk
 * FORWARD from the presented (revoked) token via `replacedBy` links to the tip and revoke it
 * (and, defensively, every unrevoked node encountered along the way), which logs out whoever
 * currently holds the live token. That's the correct fail-safe: it costs the legitimate user one
 * re-login, and it kills the stolen credential's usefulness immediately.
 */
export async function rotateRefreshToken(rawToken, { userAgent, ip } = {}) {
  if (!rawToken) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  const tokenHash = sha256Hex(rawToken);
  const tokenDoc = await RefreshToken.findOne({ tokenHash });
  if (!tokenDoc) throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Invalid refresh token');

  if (tokenDoc.revokedAt) {
    await revokeChainForward(tokenDoc);
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token already used — session revoked');
  }

  if (tokenDoc.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token expired');
  }

  // Multi-family: no longer gated on any ONE family's Membership status (a user disabled in
  // family A but still active in family B must still be able to refresh) — just the account-level
  // kill switch, same as requireAuth's own check on every subsequent request.
  const user = await User.findById(tokenDoc.userId).select('disabled').lean();
  if (!user || user.disabled) {
    throw new ApiError(401, 'INVALID_REFRESH_TOKEN', 'Account no longer active');
  }

  const rawNew = generateOpaqueToken();
  const newTokenDoc = await RefreshToken.create({
    userId: tokenDoc.userId,
    tokenHash: sha256Hex(rawNew),
    expiresAt: addRefreshExpiry(),
    userAgent: (userAgent || '').slice(0, 300),
    ipHash: hashIp(ip),
  });

  tokenDoc.revokedAt = new Date();
  tokenDoc.replacedBy = newTokenDoc._id;
  await tokenDoc.save();

  const accessToken = signAccessToken({ userId: tokenDoc.userId });

  return { accessToken, refreshToken: rawNew };
}

async function revokeChainForward(startToken) {
  const now = new Date();
  let current = startToken;
  const seen = new Set();
  while (current) {
    const key = String(current._id);
    if (seen.has(key)) break; // guard against any accidental cycle
    seen.add(key);
    if (!current.revokedAt) {
      current.revokedAt = now;
      // eslint-disable-next-line no-await-in-loop
      await current.save();
    }
    if (!current.replacedBy) break;
    // eslint-disable-next-line no-await-in-loop
    current = await RefreshToken.findById(current.replacedBy);
  }
}

/** Single-session logout: revoke exactly the presented token. Idempotent (no error if unknown/already revoked). */
export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  const tokenHash = sha256Hex(rawToken);
  await RefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
}

/**
 * Revoke every live refresh token for a user. Used by logout-all, and — per docs/API.md — must
 * also fire immediately when a member is disabled or has their password reset (members module).
 */
export async function revokeAllRefreshTokensForUser(userId) {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { revokedAt: new Date() });
}
