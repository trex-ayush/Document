import { scopeToFamily } from '../../middleware/auth.js';
import { signFileToken } from '../../utils/tokens.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';

const MAX_FOLDER_DEPTH = 25;

/** Files of a document a share is allowed to expose — `fileIds` undefined/empty means "all". */
export function selectFiles(document, fileIds) {
  if (!Array.isArray(fileIds) || !fileIds.length) return document.files || [];
  const allow = new Set(fileIds.map(String));
  return (document.files || []).filter((f) => allow.has(String(f._id)));
}

/**
 * Mints short-lived signed file URLs for one file. Relative (`/api/files/<token>`), matching the
 * exact convention the (now-landed) documents module's own serializer uses
 * (modules/documents/serializer.js's `signUrl`) — duplicated here rather than importing theirs,
 * which isn't this module's file to reach into, but kept byte-for-byte consistent so the client
 * can render a public-share file the same way it renders an authenticated one. Never returns a
 * raw storageKey.
 */
export function buildFileUrls({ file, documentId, familyId }) {
  const viewToken = signFileToken({ fileId: file._id, documentId, familyId, purpose: 'view', kind: 'original' });
  const downloadToken = signFileToken({
    fileId: file._id,
    documentId,
    familyId,
    purpose: 'download',
    kind: 'original',
  });

  const out = {
    id: String(file._id),
    label: file.label || '',
    url: `/api/files/${viewToken}`,
    thumbUrl: null,
    downloadUrl: `/api/files/${downloadToken}?download=1`,
    mimeType: file.mimeType,
    size: file.size,
  };

  if (file.thumbKey) {
    const thumbToken = signFileToken({ fileId: file._id, documentId, familyId, purpose: 'thumb', kind: 'thumb' });
    out.thumbUrl = `/api/files/${thumbToken}`;
  }

  return out;
}

export function serializeDocumentFiles(document, { fileIds, familyId }) {
  return selectFiles(document, fileIds).map((file) => buildFileUrls({ file, documentId: document._id, familyId }));
}

/**
 * Recursive folder tree for a folder share: `{ name, documents: [{title, files}], subfolders }`.
 * Deliberately omits folder/document Mongo ids (docs/API.md's folderTree shape lists only name/
 * documents/subfolders — never leak internal ids beyond what's documented).
 */
export async function buildFolderTree(familyId, folderId, { depth = 0 } = {}) {
  if (depth > MAX_FOLDER_DEPTH) return null;

  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
  if (!folder) return null;

  const [documents, subfolders] = await Promise.all([
    Document.find(scopeToFamily(familyId, { folderId })).lean(),
    Folder.find(scopeToFamily(familyId, { parentId: folderId })).lean(),
  ]);

  const subfolderTrees = await Promise.all(
    subfolders.map((f) => buildFolderTree(familyId, f._id, { depth: depth + 1 })),
  );

  return {
    name: folder.name,
    documents: documents.map((d) => ({
      title: d.title,
      files: serializeDocumentFiles(d, { familyId }),
    })),
    subfolders: subfolderTrees.filter(Boolean),
  };
}

/** Raw file+path entries (for zipping) belonging to a document share. */
export async function collectFilesForDocumentShare(familyId, share) {
  const document = await Document.findOne(scopeToFamily(familyId, { _id: share.targetId })).lean();
  if (!document) return [];
  return selectFiles(document, share.fileIds).map((file) => ({
    file,
    path: file.label ? `${file.label}-${file.originalName}` : file.originalName,
  }));
}

/** Raw file+path entries (for zipping) belonging to a folder share, recursively. */
export async function collectFilesForFolderShare(familyId, folderId, pathPrefix = '', depth = 0) {
  if (depth > MAX_FOLDER_DEPTH) return [];

  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
  if (!folder) return [];

  const [documents, subfolders] = await Promise.all([
    Document.find(scopeToFamily(familyId, { folderId })).lean(),
    Folder.find(scopeToFamily(familyId, { parentId: folderId })).lean(),
  ]);

  const out = [];
  for (const doc of documents) {
    for (const file of doc.files || []) {
      out.push({ file, path: `${pathPrefix}${folder.name}/${doc.title}/${file.label || file.originalName}` });
    }
  }

  for (const sub of subfolders) {
    // eslint-disable-next-line no-await-in-loop
    const nested = await collectFilesForFolderShare(familyId, sub._id, `${pathPrefix}${folder.name}/`, depth + 1);
    out.push(...nested);
  }

  return out;
}
