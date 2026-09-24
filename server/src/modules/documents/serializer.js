/**
 * The ONLY place a Document (or one of its file subdocs / custom fields) is turned into an HTTP
 * response body. Every route in this module must go through these functions — never call
 * `doc.toJSON()` / return a raw Mongoose doc, per the comment in models/Document.js. That keeps
 * `storageKey`, `thumbKey`, `encryption`, `thumbEncryption` and sensitive plaintext values from
 * ever reaching a client.
 */
import { signFileToken } from '../../utils/tokens.js';
import { decryptFieldValue } from '../../utils/crypto.js';
import { serializeBreadcrumbFolder } from '../folders/serializer.js';

function signUrl({ fileId, documentId, familyId, purpose, kind }) {
  const token = signFileToken({ fileId, documentId, familyId, purpose, kind });
  return `/api/files/${token}`;
}

/** One file subdoc -> the safe shape sent to clients. */
export function serializeFile(file, { documentId, familyId }) {
  const fileId = file._id.toString();
  const url = signUrl({ fileId, documentId, familyId, purpose: 'view', kind: 'original' });
  const thumbUrl = file.thumbKey
    ? signUrl({ fileId, documentId, familyId, purpose: 'thumb', kind: 'thumb' })
    : null;
  const downloadUrl = signUrl({ fileId, documentId, familyId, purpose: 'download', kind: 'original' });
  return {
    id: fileId,
    label: file.label || '',
    order: file.order,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    width: file.width ?? null,
    height: file.height ?? null,
    url,
    thumbUrl,
    downloadUrl,
    uploadedAt: file.uploadedAt,
  };
}

/** dots + last 4 visible chars of the DECRYPTED plaintext, per the product spec's mask style. */
function maskValue(plaintext) {
  const str = String(plaintext);
  const last4 = str.slice(-4);
  return `•••• ${last4}`;
}

/**
 * One customField subdoc -> the safe shape. Sensitive fields are decrypted only long enough to
 * compute the mask, then the plaintext is discarded — it never appears on the returned object.
 */
export function serializeCustomField(field) {
  const id = field._id ? field._id.toString() : undefined;
  const base = { id, key: field.key, type: field.type, order: field.order };
  if (!field.sensitive) {
    return { ...base, sensitive: false, value: field.value || '' };
  }
  const hasValue = Boolean(field.value);
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

/** Pick the lowest-`order` file that has a thumbnail, for the document-list card. */
function primaryThumbUrl(doc) {
  const files = [...(doc.files || [])].sort((a, b) => a.order - b.order);
  const withThumb = files.find((f) => f.thumbKey);
  if (!withThumb) return null;
  return signUrl({
    fileId: withThumb._id.toString(),
    documentId: doc._id.toString(),
    familyId: doc.familyId.toString(),
    purpose: 'thumb',
    kind: 'thumb',
  });
}

/** `DocumentSummary` per docs/API.md (list + browse + search results). */
export function serializeDocumentSummary(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    folderId: doc.folderId ? doc.folderId.toString() : null,
    typeId: doc.typeId ? doc.typeId.toString() : null,
    memberId: doc.memberId ? doc.memberId.toString() : null,
    tags: doc.tags || [],
    expiryDate: doc.expiryDate,
    fileCount: (doc.files || []).length,
    primaryThumbUrl: primaryThumbUrl(doc),
    updatedAt: doc.updatedAt,
  };
}

/** Full document detail, incl. breadcrumbs — see GET /documents/:id in docs/API.md. */
export function serializeDocumentDetail(doc, { breadcrumbs = [] } = {}) {
  const documentId = doc._id.toString();
  const familyId = doc.familyId.toString();
  return {
    id: documentId,
    title: doc.title,
    folderId: doc.folderId ? doc.folderId.toString() : null,
    typeId: doc.typeId ? doc.typeId.toString() : null,
    memberId: doc.memberId ? doc.memberId.toString() : null,
    tags: doc.tags || [],
    notes: doc.notes || '',
    expiryDate: doc.expiryDate,
    customFields: [...(doc.customFields || [])]
      .sort((a, b) => a.order - b.order)
      .map(serializeCustomField),
    files: [...(doc.files || [])]
      .sort((a, b) => a.order - b.order)
      .map((f) => serializeFile(f, { documentId, familyId })),
    breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
