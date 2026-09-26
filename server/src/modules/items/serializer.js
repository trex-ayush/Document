/**
 * The ONLY place a VaultItem is turned into a response. username, password, field values and
 * notes are stored encrypted; authenticated members get them back as plain text here (no re-auth).
 * List/browse shapes never include the password — only `hasPassword`.
 */
import { openText } from '../documents/secretText.js';
import { serializeBreadcrumbFolder } from '../folders/serializer.js';
import { isSecretField } from './sensitiveKey.js';

// `secret` is always a boolean; a row saved before the flag existed is secret when its key looks
// sensitive ("ATM PIN").
function plainFields(item, { hideSecret = false } = {}) {
  return (item.fields || []).map((f) => {
    const secret = isSecretField(f);
    // Lists never carry a secret value (a PIN, say); only the item's own page does.
    return { key: f.key, value: secret && hideSecret ? '' : openText(f.value), secret };
  });
}

function baseShape(item, { hideSecret = false } = {}) {
  const isLogin = item.kind === 'login';
  return {
    id: item._id.toString(),
    kind: item.kind,
    title: item.title,
    folderId: item.folderId ? item.folderId.toString() : null,
    username: isLogin ? openText(item.username) : '',
    hasPassword: isLogin && Boolean(item.password),
    fields: isLogin ? plainFields(item, { hideSecret }) : [],
    notes: openText(item.notes),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** `ItemSummary` — list/browse. Everything except the password and secret field values. */
export function serializeItemSummary(item) {
  return baseShape(item, { hideSecret: true });
}

/** Full item — GET/POST/PATCH /items/:id. Includes the plain-text password. */
export function serializeItemDetail(item, { breadcrumbs = [] } = {}) {
  return {
    ...baseShape(item),
    password: item.kind === 'login' ? openText(item.password) : '',
    breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
  };
}
