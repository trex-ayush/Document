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

export function serializeFamily(doc) {
  return toPlain(doc);
}

/**
 * `userEmail` is attached as `user: { email }` only when the membership can log in — matches
 * docs/API.md: "Membership includes user.email when canLogin".
 */
export function serializeMembership(doc, { userEmail } = {}) {
  const o = toPlain(doc);
  if (!o) return null;
  if (o.canLogin && userEmail) {
    o.user = { email: userEmail };
  }
  return o;
}
