import { scopeToFamily } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { Folder } from '../../models/Folder.js';
import { Document, activeFiles } from '../../models/Document.js';
import { VaultItem } from '../../models/VaultItem.js';
import { decryptFieldValue } from '../../utils/crypto.js';
import { signFileToken } from '../../utils/tokens.js';
import { buildFolderPaths, SHARED_FOLDER_NAME_HI } from '../folders/sharedFolder.js';

const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 70;

/**
 * Encrypted values are stored as `iv.tag.ciphertext` (utils/crypto.js). Anything that doesn't look
 * like that is treated as plain text; a value that looks encrypted but won't decrypt is treated
 * as empty — ciphertext is never matched against or returned.
 */
function reveal(stored) {
  if (!stored) return '';
  const str = String(stored);
  if (str.split('.').length !== 3) return str;
  try {
    return decryptFieldValue(str);
  } catch {
    return '';
  }
}

/** Short one-line excerpt of `text` around the first match of `needle` (already lowercased). */
function makeSnippet(text, needle) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  const idx = flat.toLowerCase().indexOf(needle);
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_BEFORE);
  const end = Math.min(flat.length, idx + needle.length + SNIPPET_AFTER);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

function contains(text, needle) {
  return Boolean(text) && String(text).toLowerCase().includes(needle);
}

/** First text (in the order given) that contains the needle -> its snippet, else undefined. */
function firstSnippet(texts, needle) {
  for (const text of texts) {
    if (contains(text, needle)) return makeSnippet(text, needle);
  }
  return undefined;
}

/** Title/name matches first, then most recently updated. */
function rank(a, b) {
  if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
  return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
}

/** Same signed thumbnail URL form the document list uses: lowest-order file that has a thumb. */
function thumbnailUrl(doc) {
  const withThumb = [...activeFiles(doc)]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .find((f) => f.thumbKey);
  if (!withThumb) return null;
  const token = signFileToken({
    fileId: withThumb._id,
    documentId: doc._id,
    familyId: doc.familyId,
    purpose: 'thumb',
    kind: 'thumb',
  });
  return `/api/files/${token}`;
}

/** Folder ids (strings) of `rootId` and everything below it, from an in-memory folder list. */
function subtreeIds(folders, rootId) {
  const children = new Map();
  for (const f of folders) {
    const parent = f.parentId ? String(f.parentId) : 'root';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(String(f._id));
  }
  const out = new Set();
  const stack = [String(rootId)];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) || []));
  }
  return out;
}

/**
 * Family-wide (or folder-scoped) search over folder names, document title + notes + the text read
 * from each of its files (snippet prefixed with the file's name), and vault item
 * title + username + extra field keys/values + notes. Case-insensitive substring match. Encrypted
 * values are decrypted in memory only for matching/snippets and never persisted. A saved password
 * is never loaded, matched or returned.
 *
 * `folderId` (optional) limits results to that folder's subtree; the folder itself is not
 * returned as a folder result.
 */
export async function searchFamily(familyId, { q, folderId = null, limit = 20 }) {
  const needle = q.trim().toLowerCase();

  const folders = await Folder.find(scopeToFamily(familyId)).select('_id name parentId isSystem updatedAt').lean();

  let scope = null;
  if (folderId) {
    if (!folders.some((f) => String(f._id) === String(folderId))) {
      throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
    }
    scope = subtreeIds(folders, folderId);
  }

  const contentFilter = scope ? { folderId: { $in: [...scope] } } : {};
  const [paths, documents, items] = await Promise.all([
    buildFolderPaths(familyId),
    Document.find(scopeToFamily(familyId, contentFilter))
      .select('_id familyId folderId title notes files._id files.thumbKey files.order files.deletedAt files.label files.originalName files.textEncrypted updatedAt')
      .lean(),
    // `password` is deliberately NOT selected.
    VaultItem.find(scopeToFamily(familyId, contentFilter))
      .select('_id kind folderId title username fields notes updatedAt')
      .lean(),
  ]);

  const pathOf = (id) => (id ? paths.get(String(id)) || '' : '');

  const folderHits = folders
    .filter((f) => (!scope || (scope.has(String(f._id)) && String(f._id) !== String(folderId))))
    // The Shared folder also matches by the name Hindi readers see for it.
    .filter((f) => contains(f.name, needle) || (f.isSystem && contains(SHARED_FOLDER_NAME_HI, needle)))
    .map((f) => ({
      titleMatch: true,
      updatedAt: f.updatedAt,
      out: {
        id: String(f._id),
        name: f.name,
        parentId: f.parentId ? String(f.parentId) : null,
        isSystem: Boolean(f.isSystem),
        // Where the folder lives (its parent's path), like documents and items.
        path: pathOf(f.parentId),
      },
    }));

  const documentHits = [];
  for (const d of documents) {
    const titleMatch = contains(d.title, needle);
    let snippet = titleMatch ? null : firstSnippet([reveal(d.notes)], needle);
    if (snippet === undefined) {
      // The text read from each file (not from files in the Bin), named by its file.
      for (const f of [...activeFiles(d)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        const hit = firstSnippet([reveal(f.textEncrypted)], needle);
        if (hit !== undefined) {
          snippet = `${f.label || f.originalName}: ${hit}`;
          break;
        }
      }
    }
    if (!titleMatch && snippet === undefined) continue;
    documentHits.push({
      titleMatch,
      updatedAt: d.updatedAt,
      doc: d,
      snippet,
    });
  }

  const itemHits = [];
  for (const it of items) {
    const titleMatch = contains(it.title, needle);
    let snippet = null;
    if (!titleMatch) {
      const texts = [reveal(it.username)];
      for (const field of it.fields || []) {
        const value = reveal(field.value);
        texts.push(field.key ? `${field.key}: ${value}` : value);
      }
      texts.push(reveal(it.notes));
      snippet = firstSnippet(texts, needle);
      if (snippet === undefined) continue;
    }
    itemHits.push({
      titleMatch,
      updatedAt: it.updatedAt,
      out: {
        id: String(it._id),
        kind: it.kind,
        title: it.title,
        folderId: it.folderId ? String(it.folderId) : null,
        path: pathOf(it.folderId),
        updatedAt: it.updatedAt,
        snippet,
      },
    });
  }

  return {
    folders: folderHits.sort(rank).slice(0, limit).map((h) => h.out),
    // Thumbnail tokens are signed only for the documents actually returned.
    documents: documentHits
      .sort(rank)
      .slice(0, limit)
      .map(({ doc, snippet }) => ({
        id: String(doc._id),
        title: doc.title,
        folderId: doc.folderId ? String(doc.folderId) : null,
        path: pathOf(doc.folderId),
        fileCount: activeFiles(doc).length,
        thumbnailUrl: thumbnailUrl(doc),
        updatedAt: doc.updatedAt,
        snippet,
      })),
    items: itemHits.sort(rank).slice(0, limit).map((h) => h.out),
  };
}
