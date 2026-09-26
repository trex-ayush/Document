import { scopeToFamily } from '../../middleware/auth.js';
import { signFileToken } from '../../utils/tokens.js';
import { Document, activeFiles } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';

const MAX_FOLDER_DEPTH = 25;

/**
 * Files of a document a share is allowed to expose — `fileIds` undefined/empty means "all".
 * Files in the Bin are never exposed, even when a share names them in `fileIds`.
 */
function selectFiles(document, fileIds) {
  const files = [...activeFiles(document)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!Array.isArray(fileIds) || !fileIds.length) return files;
  const allow = new Set(fileIds.map(String));
  return files.filter((f) => allow.has(String(f._id)));
}

/**
 * Mints short-lived signed file URLs for one file. Relative (`/api/files/<token>`), matching the
 * exact convention the (now-landed) documents module's own serializer uses
 * (modules/documents/serializer.js's `signUrl`) — duplicated here rather than importing theirs,
 * which isn't this module's file to reach into, but kept byte-for-byte consistent so the client
 * can render a public-share file the same way it renders an authenticated one. Never returns a
 * raw storageKey.
 */
function buildFileUrls({ file, documentId, familyId }) {
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
    originalName: file.originalName,
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
 * Recursive folder tree for a folder share: `{ name, isSystem, documents: [{title, files}], subfolders }`.
 * Titles and files only — documents are loaded with just those fields so notes can never leak,
 * and vault items (passwords, notes) are never part of a share. Omits folder/document ids.
 */
export async function buildFolderTree(familyId, folderId, { depth = 0 } = {}) {
  if (depth > MAX_FOLDER_DEPTH) return null;

  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
  if (!folder) return null;

  const [documents, subfolders] = await Promise.all([
    Document.find(scopeToFamily(familyId, { folderId })).select('title files').sort({ title: 1 }).lean(),
    Folder.find(scopeToFamily(familyId, { parentId: folderId })).select('name').sort({ name: 1 }).lean(),
  ]);

  const subfolderTrees = await Promise.all(
    subfolders.map((f) => buildFolderTree(familyId, f._id, { depth: depth + 1 })),
  );

  return {
    name: folder.name,
    // Lets the page show the Shared folder in the reader's language.
    isSystem: Boolean(folder.isSystem),
    documents: documents.map((d) => ({
      title: d.title,
      files: serializeDocumentFiles(d, { familyId }),
    })),
    subfolders: subfolderTrees.filter(Boolean),
  };
}

/** Raw file+path entries (for zipping) belonging to a document share. */
export async function collectFilesForDocumentShare(familyId, share) {
  const document = await Document.findOne(scopeToFamily(familyId, { _id: share.targetId })).select('files').lean();
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
    Document.find(scopeToFamily(familyId, { folderId })).select('title files').lean(),
    Folder.find(scopeToFamily(familyId, { parentId: folderId })).select('name').lean(),
  ]);

  const out = [];
  for (const doc of documents) {
    for (const file of activeFiles(doc)) {
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
