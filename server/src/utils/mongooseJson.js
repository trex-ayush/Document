/**
 * Shared toJSON behavior for every model: `_id` -> `id` (string), drop `__v`, drop any extra
 * paths that should never leave the server (passwordHash, tokenHash, storage keys, ...).
 * Every model file calls `applyIdTransform(schema, { hide: [...] })` once, near the bottom.
 */
export function applyIdTransform(schema, { hide = [] } = {}) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = ret._id?.toString();
      delete ret._id;
      for (const path of hide) {
        deletePath(ret, path);
      }
      return ret;
    },
  });
}

function deletePath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (cur == null) return;
    cur = cur[parts[i]];
  }
  if (cur == null) return;
  delete cur[parts[parts.length - 1]];
}
