/**
 * Turns an activity entry's `meta` into one short, plain line for the Activity feed — e.g.
 * `“Aadhaar card” · changed: title, notes` or `with Google` — instead of raw keys like
 * `fileId: 6ab8…` or `changedKeys: name`. Ids, internal flags and unknown keys are never shown.
 * Pure (takes `t`), so it is unit-tested without React.
 */

const DURATIONS = {
  '12h': ['12 hours', '12 घंटे'],
  '24h': ['1 day', '1 दिन'],
  '7d': ['7 days', '7 दिन'],
};

// Field names the server logs for "what changed" -> plain words.
const FIELD_WORDS = {
  title: 'title',
  name: 'name',
  notes: 'notes',
  folderId: 'folder',
  parentId: 'folder',
  fileText: 'text read from the file',
  kind: 'type',
  username: 'username',
  password: 'password',
  fields: 'extra details',
  access: 'access',
  role: 'role',
  status: 'status',
  defaultShareDuration: 'share link length',
  settings: 'settings',
};

const isId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);

function durationText(code, t) {
  const d = DURATIONS[code];
  if (!d) return null;
  return t(`meta.duration.${code}`, d[0]);
}

function fieldList(keys, t) {
  const words = [...new Set((keys || []).filter((k) => FIELD_WORDS[k]))].map((k) => t(`meta.field.${k}`, FIELD_WORDS[k]));
  return words.length ? words.join(', ') : null;
}

/**
 * @param {{ action?: string, meta?: object }} activity
 * @param {(key: string, fallback: string, opts?: object) => string} t  i18next `t` (activity namespace)
 * @returns {string|null}
 */
export function describeActivityMeta(activity, t = (_k, f) => f) {
  const m = activity?.meta;
  if (!m || typeof m !== 'object') return null;
  const tt = (key, fallback, opts) => (opts ? t(key, fallback, opts) : t(key, fallback));
  const parts = [];

  // The thing's own name first.
  const label = [m.title, m.name, m.originalName].find((v) => typeof v === 'string' && v.trim() && !isId(v));
  if (label) parts.push(`“${label.trim()}”`);

  if (m.kind === 'login') parts.push(tt('meta.kind.login', 'password'));
  else if (m.kind === 'note') parts.push(tt('meta.kind.note', 'note'));

  const count = Number(m.count ?? m.fileCount);
  if (Number.isFinite(count) && count > 0) parts.push(tt('meta.files', count === 1 ? '{{count}} file' : '{{count}} files', { count }));

  if (m.method === 'google') parts.push(tt('meta.withGoogle', 'with Google'));
  else if (m.method === 'password') parts.push(tt('meta.withPassword', 'with a password'));

  const changed = fieldList(m.fields || m.changedKeys, t);
  if (changed) parts.push(tt('meta.changed', 'changed: {{list}}', { list: changed }));

  if (m.revoke === true) parts.push(tt('meta.turnedOff', 'link turned off'));
  const extend = durationText(m.extendTo, t);
  if (extend) parts.push(tt('meta.extendedTo', 'link now lasts {{duration}}', { duration: extend }));
  const duration = durationText(m.duration, t);
  if (duration) parts.push(tt('meta.lasts', 'link lasts {{duration}}', { duration }));

  if (m.emailed === true) parts.push(tt('meta.emailed', 'sent by email'));

  return parts.length ? parts.join(' · ') : null;
}
