/**
 * The ONLY place a Document (or one of its file subdocs) is turned into an HTTP response body.
 * Every route in this module must go through these functions — never call `doc.toJSON()` /
 * return a raw Mongoose doc, per the comment in models/Document.js. That keeps `storageKey`,
 * `thumbKey`, `encryption` and `thumbEncryption` from ever reaching a client, and is where the
 * encrypted notes are decrypted for authenticated members.
 */
import { signFileToken } from '../../utils/tokens.js';
import { serializeBreadcrumbFolder } from '../folders/serializer.js';
import { openText } from './secretText.js';
import { activeFiles } from '../../models/Document.js';

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

/** Signed thumbnail URL of the lowest-`order` file that has one (for list cards), or null. */
export function primaryThumbUrl(doc) {
  const files = [...activeFiles(doc)].sort((a, b) => a.order - b.order);
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

/** `DocumentSummary` (list + browse). Notes are not included — open the document for those. */
export function serializeDocumentSummary(doc) {
  return {
    id: doc._id.toString(),
    title: doc.title,
    folderId: doc.folderId ? doc.folderId.toString() : null,
    fileCount: activeFiles(doc).length,
    primaryThumbUrl: primaryThumbUrl(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Full document detail, incl. decrypted notes and breadcrumbs — GET /documents/:id. */
export function serializeDocumentDetail(doc, { breadcrumbs = [] } = {}) {
  const documentId = doc._id.toString();
  const familyId = doc.familyId.toString();
  return {
    id: documentId,
    title: doc.title,
    folderId: doc.folderId ? doc.folderId.toString() : null,
    notes: openText(doc.notes),
    files: [...activeFiles(doc)]
      .sort((a, b) => a.order - b.order)
      .map((f) => serializeFile(f, { documentId, familyId })),
    breadcrumbs: breadcrumbs.map(serializeBreadcrumbFolder),
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
