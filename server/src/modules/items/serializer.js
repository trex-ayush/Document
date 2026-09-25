/**
 * The ONLY place a VaultItem is turned into a response. username, password, field values and
 * notes are stored encrypted; authenticated members get them back as plain text here (no re-auth).
 * List/browse shapes never include the password — only `hasPassword`.
 */
import { openText } from '../documents/secretText.js';
import { serializeBreadcrumbFolder } from '../folders/serializer.js';

function plainFields(item) {
  return (item.fields || []).map((f) => ({ key: f.key, value: openText(f.value) }));
}

function baseShape(item) {
  const isLogin = item.kind === 'login';
  return {
    id: item._id.toString(),
    kind: item.kind,
    title: item.title,
    folderId: item.folderId ? item.folderId.toString() : null,
    username: isLogin ? openText(item.username) : '',
    hasPassword: isLogin && Boolean(item.password),
    fields: isLogin ? plainFields(item) : [],
    notes: openText(item.notes),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** `ItemSummary` — list/browse. Everything except the password itself. */
export function serializeItemSummary(item) {
  return baseShape(item);
}

/** Full item — GET/POST/PATCH /items/:id. Includes the plain-text password. */
export function serializeItemDetail(item, { breadcrumbs = [] } = {}) {
  return {
    ...baseShape(item),
    password: item.kind === 'login' ? openText(item.password) : '',
    breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
  };
}
