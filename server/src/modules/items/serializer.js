/**
 * The ONLY place a VaultItem (or one of its field subdocs) is turned into a response — HTTP or the
 * integration seam's return values. Every caller must go through these functions, never
 * `item.toJSON()` / a raw Mongoose doc, per the comment in models/VaultItem.js.
 */
import { decryptFieldValue } from '../../utils/crypto.js';

/** dots + last 4 visible chars of the DECRYPTED plaintext — matches documents/serializer.js's mask style. */
function maskValue(plaintext) {
  const str = String(plaintext);
  const last4 = str.slice(-4);
  return `•••• ${last4}`;
}

/**
 * One field subdoc -> the safe shape. Sensitive fields are decrypted only long enough to compute
 * the mask, then the plaintext is discarded. Pass `includeSensitive: true` (public share responses
 * only, and only once the shares module has verified password+<=24h expiry) to return the
 * decrypted plaintext instead of a mask.
 */
export function serializeItemField(field, { includeSensitive = false } = {}) {
  const id = field._id ? field._id.toString() : undefined;
  const base = { id, key: field.key, type: field.type, order: field.order };
  if (!field.sensitive) {
    return { ...base, sensitive: false, value: field.value || '' };
  }
  const hasValue = Boolean(field.value);
  if (includeSensitive) {
    let value = '';
    if (hasValue) {
      try {
        value = decryptFieldValue(field.value);
      } catch {
        value = '';
      }
    }
    return { ...base, sensitive: true, hasValue, value };
  }
  let masked = '';
  if (hasValue) {
    try {
      masked = maskValue(decryptFieldValue(field.value));
    } catch {
      masked = '••••';
    }
  }
  return { ...base, sensitive: true, masked, hasValue };
}

function sortedFields(item) {
  return [...(item.fields || [])].sort((a, b) => a.order - b.order);
}

/** Up to 2 non-sensitive fields, for list/browse/search cards (ItemCard) — never a sensitive value. */
function previewFields(item) {
  return sortedFields(item)
    .filter((f) => !f.sensitive)
    .slice(0, 2)
    .map((f) => ({ key: f.key, value: f.value || '' }));
}

/** `ItemSummary` — list/browse/search results. Sensitive values never appear, even masked. */
export function serializeItemSummary(item) {
  return {
    id: item._id.toString(),
    kind: item.kind,
    title: item.title,
    folderId: item.folderId ? item.folderId.toString() : null,
    memberId: item.memberId ? item.memberId.toString() : null,
    tags: item.tags || [],
    fieldCount: (item.fields || []).length,
    preview: previewFields(item),
    updatedAt: item.updatedAt,
  };
}

/** Full item detail — GET/POST/PATCH /items/:id response. */
export function serializeItemDetail(item) {
  return {
    id: item._id.toString(),
    kind: item.kind,
    title: item.title,
    folderId: item.folderId ? item.folderId.toString() : null,
    memberId: item.memberId ? item.memberId.toString() : null,
    tags: item.tags || [],
    fields: sortedFields(item).map((f) => serializeItemField(f)),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Shape handed to the shares module's `getItemForShare` (docs/API.md "Items" + "Shares") — used
 * both for the internal share-create existence check (`includeSensitive` always false there) and
 * the public share payload (`payload.item`, `includeSensitive` only true once the shares module has
 * verified password+<=24h expiry). Deliberately excludes familyId/folderId/memberId/createdBy —
 * nothing a public link needs to see.
 */
export function serializeItemForShare(item, { includeSensitive = false } = {}) {
  return {
    title: item.title,
    kind: item.kind,
    tags: item.tags || [],
    fields: sortedFields(item).map((f) => serializeItemField(f, { includeSensitive })),
  };
}
