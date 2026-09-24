import * as authService from './service.js';
import * as googleService from './googleService.js';
import { serializeUser, serializeMembership, serializeFamily } from './serializers.js';

function wrap(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function authPayload({ user, membership, family, accessToken, refreshToken }) {
  return {
    user: serializeUser(user),
    membership: serializeMembership(membership, { userEmail: user.email }),
    family: serializeFamily(family),
    accessToken,
    refreshToken,
  };
}

export const signup = wrap(async (req, res) => {
  const result = await authService.signup(req.body, req);
  res.status(201).json(authPayload(result));
});

export const login = wrap(async (req, res) => {
  const result = await authService.login(req.body, req);
  res.status(200).json(authPayload(result));
});

export const refresh = wrap(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken, req);
  res.status(200).json(result);
});

export const logout = wrap(async (req, res) => {
  await authService.logout(req.body.refreshToken, req);
  res.status(204).send();
});

export const logoutAll = wrap(async (req, res) => {
  await authService.logoutAll(req.auth.userId, req);
  res.status(204).send();
});

export const me = wrap(async (req, res) => {
  const result = await authService.getMe(req.auth);
  res.status(200).json(result);
});

export const patchMe = wrap(async (req, res) => {
  const user = await authService.updateMe(req.auth.userId, req.body);
  res.status(200).json({ user: serializeUser(user) });
});

export const changePassword = wrap(async (req, res) => {
  await authService.changePassword(req.auth.userId, req.body, req);
  res.status(204).send();
});

export const reauth = wrap(async (req, res) => {
  const result = await authService.reauth(req.auth, req.body, req);
  res.status(200).json(result);
});

// ---------- Google sign-in ----------

export const googleSignIn = wrap(async (req, res) => {
  const result = await googleService.googleSignIn(req.body, req);
  if (result.needsSignup) {
    return res.status(200).json({
      needsSignup: true,
      signupToken: result.signupToken,
      profile: result.profile,
    });
  }
  res.status(200).json({ needsSignup: false, ...authPayload(result) });
});

export const googleComplete = wrap(async (req, res) => {
  const result = await googleService.googleComplete(req.body, req);
  res.status(201).json(authPayload(result));
});

export const googleLink = wrap(async (req, res) => {
  const result = await googleService.googleLink(req.auth, req.body, req);
  res.status(200).json({ user: serializeUser(result.user) });
});

export const googleUnlink = wrap(async (req, res) => {
  const result = await googleService.googleUnlink(req.auth, req);
  res.status(200).json({ user: serializeUser(result.user) });
});

export const setPassword = wrap(async (req, res) => {
  await authService.setPassword(req.auth.userId, req.body.newPassword, req);
  res.status(204).send();
});

// ---------- Email module: forgot password / reset password / accept invite ----------

const GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account with that email exists, we've sent a password reset link.";

export const forgotPassword = wrap(async (req, res) => {
  await authService.forgotPassword(req.body, req);
  // Always 200 with the same generic message — no account-enumeration signal either way.
  res.status(200).json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
});

export const resetPassword = wrap(async (req, res) => {
  await authService.resetPassword(req.body, req);
  res.status(204).send();
});

export const getInviteContext = wrap(async (req, res) => {
  const result = await authService.getInviteContext(req.params.token);
  res.status(200).json(result);
});

export const acceptInvite = wrap(async (req, res) => {
  const result = await authService.acceptInvite(req.body, req);
  res.status(200).json(authPayload(result));
});
