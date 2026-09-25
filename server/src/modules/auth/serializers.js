/**
 * Shared "Mongoose doc/lean object -> client JSON" shaping for the identity modules
 * (auth/members/family). Deliberately NOT the same as each model's own `toJSON` transform
 * (`utils/mongooseJson.js`) because these responses sometimes need to attach a computed field
 * (`membership.user.email`) that isn't on the schema itself.
 *
 * Works on either a live Mongoose document or a `.lean()` plain object.
 */
function toPlain(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const id = obj._id ? String(obj._id) : obj.id;
  delete obj._id;
  delete obj.__v;
  return { id, ...obj };
}

/** Never leak passwordHash. */
export function serializeUser(doc) {
  const o = toPlain(doc);
  if (!o) return null;
  delete o.passwordHash;
  return o;
}

/**
 * `settings` is rebuilt from an allow-list rather than passed through: the old per-family
 * maxFileMB/storageLimitMB/activityRetentionDays (now platform-admin-only, see
 * utils/effectiveSettings.js) may still be sitting in an older family's raw DB document, and must
 * never reappear in a response as if a family admin could still see or change them.
 */
export function serializeFamily(doc) {
  const o = toPlain(doc);
  if (!o) return null;
  const defaultShareDuration = o.settings?.defaultShareDuration || '12h';
  o.settings = { defaultShareDuration };
  o.defaultShareDuration = defaultShareDuration;
  return o;
}

/**
 * `userEmail`/`userAvatarUrl`/`userAvatarColor` are attached as `user: {...}` only when the
 * membership can log in — matches docs/API.md: "Membership includes user.email when canLogin".
 * avatarUrl/avatarColor let member lists (Avatar/AvatarStack) show a linked Google photo or the
 * user's initials color for someone other than the caller themself.
 */
export function serializeMembership(doc, { userEmail, userAvatarUrl, userAvatarColor } = {}) {
  const o = toPlain(doc);
  if (!o) return null;
  // Internal-only multi-family invite bookkeeping (docs/DECISIONS.md "Multi-family accounts") —
  // never part of the documented Membership API shape (docs/API.md's GET /members). Stripped
  // here (Membership.js itself is out of this agent's ownership) since every membership response
  // goes through this one serializer.
  delete o.invitedEmail;
  delete o.invitedLoginMethod;
  if (o.canLogin && userEmail) {
    o.user = { email: userEmail, avatarUrl: userAvatarUrl || null, avatarColor: userAvatarColor || null };
  }
  return o;
}
