import * as authService from './service.js';
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
  const result = await authService.reauth(req.auth, req.body.password, req);
  res.status(200).json(result);
});
