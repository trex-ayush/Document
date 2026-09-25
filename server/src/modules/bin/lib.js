/**
 * Shared logic for the family Bin (docs/DECISIONS.md "Soft delete / recycle bin"): listing,
 * restoring, and permanently purging soft-deleted documents/folders/items, and single files
 * deleted out of a document (type 'file' — a soft-deleted entry in a Document's `files[]`, keyed
 * by the file subdoc's own id). Used by this module's
 * own family-scoped routes AND by the platform admin's cross-family purge view
 * (modules/platform/routes.js) — one place owns "what does restore/purge actually do" so the two
 * surfaces can never drift.
 *
 * Bypass convention: every lookup here that needs to see a soft-deleted row explicitly mentions
 * `deletedAt` in its filter (`{ $ne: null }` to find only deleted rows, `ANY_DELETED_STATE` to
 * match regardless of state, including legacy rows that have no `deletedAt` field at all) — see
 * models/plugins/softDelete.js for why that's what opts a query out of the default "active rows
 * only" filter.
 */
import mongoose from 'mongoose';
import { Document } from '../../models/Document.js';
import { Membership } from '../../models/Membership.js';
import { Folder } from '../../models/Folder.js';
import { VaultItem } from '../../models/VaultItem.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { getStorage } from '../../storage/index.js';
import { totalStoredBytes, adjustFamilyStorageBytes } from '../documents/storageAccounting.js';
import { getDescendantFolderIds } from '../folders/folderTree.js';
import { ensureSharedFolder } from '../folders/sharedFolder.js';
import { ANY_DELETED_STATE } from '../../models/plugins/softDelete.js';

const DELETED_ONLY = { deletedAt: { $ne: null } };
const ANY_STATE = ANY_DELETED_STATE;
// Documents holding at least one binned file — in ANY document state, so a file deleted before
// its whole document was binned stays listed (and restorable) on its own.
const HAS_DELETED_FILE = { files: { $elemMatch: { deletedAt: { $ne: null } } }, ...ANY_STATE };
const FILE_FIELDS = 'title folderId familyId deletedAt files._id files.label files.originalName files.deletedAt files.deletedBy';

/** An id that can't be an ObjectId can't be in the bin either. */
function toObjectIdOrNotInBin(id) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
  return new mongoose.Types.ObjectId(String(id));
}

/** Documents that hold the given binned file (by the file subdoc's id), in any document state. */
function binnedFileFilter(fileObjectId) {
  return { files: { $elemMatch: { _id: fileObjectId, deletedAt: { $ne: null } } }, ...ANY_STATE };
}

const idOrNull = (v) => (v ? String(v) : null);

/**
 * One `file` bin entry per binned file of each document. `documentDeleted` tells the client the
 * file's document is itself in the bin too (restoring the file brings the document back with it
 * — see restoreFile).
 */
function fileEntries(documents, { withFamily = false } = {}) {
  return documents.flatMap((d) =>
    (d.files || [])
      .filter((f) => f.deletedAt)
      .map((f) => ({
        id: String(f._id),
        type: 'file',
        name: f.label || f.originalName,
        originalName: f.originalName,
        documentId: String(d._id),
        documentTitle: d.title,
        documentDeleted: Boolean(d.deletedAt),
        ...(withFamily ? { familyId: String(d.familyId) } : {}),
        deletedAt: f.deletedAt,
        deletedBy: idOrNull(f.deletedBy),
      })),
  );
}

/** Adds `deletedByName` (the member's current name, or null) to every entry. */
async function attachDeletedByNames(familyId, entries) {
  const ids = [...new Set(entries.map((e) => e.deletedBy).filter(Boolean))];
  const members = ids.length
    ? await Membership.find(scopeToFamily(familyId, { _id: { $in: ids } })).select('name').lean()
    : [];
  const nameById = new Map(members.map((m) => [String(m._id), m.name]));
  return entries.map((e) => ({ ...e, deletedByName: (e.deletedBy && nameById.get(e.deletedBy)) || null }));
}

/** This family's whole bin, newest-deleted first, as a flat list across all four types. */
export async function listBinEntries(familyId) {
  const [documents, folders, items, withFiles] = await Promise.all([
    Document.find(scopeToFamily(familyId, DELETED_ONLY)).select('title folderId deletedAt deletedBy').lean(),
    Folder.find(scopeToFamily(familyId, DELETED_ONLY)).select('name deletedAt deletedBy').lean(),
    VaultItem.find(scopeToFamily(familyId, DELETED_ONLY)).select('title kind deletedAt deletedBy').lean(),
    Document.find(scopeToFamily(familyId, HAS_DELETED_FILE)).select(FILE_FIELDS).lean(),
  ]);

  const entries = [
    ...documents.map((d) => ({ id: String(d._id), type: 'document', name: d.title, deletedAt: d.deletedAt, deletedBy: idOrNull(d.deletedBy) })),
    ...folders.map((f) => ({ id: String(f._id), type: 'folder', name: f.name, deletedAt: f.deletedAt, deletedBy: idOrNull(f.deletedBy) })),
    ...items.map((i) => ({ id: String(i._id), type: 'item', name: i.title, deletedAt: i.deletedAt, deletedBy: idOrNull(i.deletedBy) })),
    ...fileEntries(withFiles),
  ];
  entries.sort((a, b) => b.deletedAt - a.deletedAt);
  return attachDeletedByNames(familyId, entries);
}

/** Same as listBinEntries but across EVERY family — platform admin's cross-family purge view. */
export async function listBinEntriesAllFamilies() {
  const [documents, folders, items, withFiles] = await Promise.all([
    Document.find(DELETED_ONLY).select('title folderId familyId deletedAt').lean(),
    Folder.find(DELETED_ONLY).select('name familyId deletedAt').lean(),
    VaultItem.find(DELETED_ONLY).select('title kind familyId deletedAt').lean(),
    Document.find(HAS_DELETED_FILE).select(FILE_FIELDS).lean(),
  ]);

  const entries = [
    ...documents.map((d) => ({ id: String(d._id), type: 'document', name: d.title, familyId: String(d.familyId), deletedAt: d.deletedAt })),
    ...folders.map((f) => ({ id: String(f._id), type: 'folder', name: f.name, familyId: String(f.familyId), deletedAt: f.deletedAt })),
    ...items.map((i) => ({ id: String(i._id), type: 'item', name: i.title, familyId: String(i.familyId), deletedAt: i.deletedAt })),
    // eslint-disable-next-line no-unused-vars
    ...fileEntries(withFiles, { withFamily: true }).map(({ deletedBy, ...e }) => e),
  ];
  entries.sort((a, b) => b.deletedAt - a.deletedAt);
  return entries;
}

/**
 * Looks up a bin entry's family + name WITHOUT already knowing its family (the platform admin's
 * purge endpoint only receives `{ type, id }` — see modules/platform/routes.js). Deliberately has
 * no `scopeToFamily` — this is the one legitimate cross-family lookup in the app, gated entirely
 * by the platform-owner check its only caller already enforces. Throws 404 NOT_IN_BIN if the id
 * doesn't exist or isn't actually deleted, so a purge can never be pointed at an active row.
 */
export async function findBinEntryFamilyId(type, id) {
  if (type === 'file') {
    const fileObjectId = toObjectIdOrNotInBin(id);
    const doc = await Document.findOne(binnedFileFilter(fileObjectId)).select('familyId files._id files.label files.originalName').lean();
    if (!doc) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
    const file = doc.files.find((f) => f._id.equals(fileObjectId));
    return { familyId: String(doc.familyId), name: file.label || file.originalName };
  }

  const Model = { document: Document, folder: Folder, item: VaultItem }[type];
  if (!Model) throw new ApiError(400, 'VALIDATION_ERROR', `Unknown bin entry type: ${type}`);

  const row = await Model.findOne({ _id: id, ...DELETED_ONLY }).select('familyId title name').lean();
  if (!row) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
  return { familyId: String(row.familyId), name: row.title || row.name };
}

/**
 * Restores every deleted ancestor of `folderId` (walking parentId upward), stopping as soon as an
 * already-active folder is reached. Used both when restoring a folder itself (to reach above it)
 * and when restoring a document/item directly (so it doesn't come back invisible inside a folder
 * that's still in the bin) — a plain family member restoring "Passport.pdf" from the bin expects
 * it to just be reachable again, not to also have to go dig out its folder first.
 */
async function restoreAncestorFolders(familyId, folderId) {
  let currentId = folderId;
  while (currentId) {
    // eslint-disable-next-line no-await-in-loop
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: currentId, ...ANY_STATE })).lean();
    if (!folder || !folder.deletedAt) break;
    // eslint-disable-next-line no-await-in-loop
    await Folder.updateOne({ _id: folder._id, ...ANY_STATE }, { $set: { deletedAt: null, deletedBy: null } });
    currentId = folder.parentId;
  }
}

/**
 * Where a restored document/item goes: its own folder if that still exists (bringing the folder's
 * binned ancestor chain back with it), otherwise — the folder was permanently purged, or it never
 * had one — the family's Shared folder.
 */
async function restoreTargetFolderId(familyId, folderId) {
  if (folderId) {
    const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId, ...ANY_STATE })).select('_id').lean();
    if (folder) {
      await restoreAncestorFolders(familyId, folderId);
      return folder._id;
    }
  }
  const shared = await ensureSharedFolder(familyId);
  return shared._id;
}

/** Restores one document from the bin (see restoreTargetFolderId for where it lands). */
export async function restoreDocument(familyId, documentId) {
  const doc = await Document.findOne(scopeToFamily(familyId, { _id: documentId, ...ANY_STATE })).lean();
  if (!doc || !doc.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
  const folderId = await restoreTargetFolderId(familyId, doc.folderId);
  await Document.updateOne({ _id: doc._id, ...ANY_STATE }, { $set: { deletedAt: null, deletedBy: null, folderId } });
  return { ...doc, folderId };
}

/** Restores one vault item from the bin (see restoreTargetFolderId for where it lands). */
export async function restoreItem(familyId, itemId) {
  const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: itemId, ...ANY_STATE })).lean();
  if (!item || !item.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
  const folderId = await restoreTargetFolderId(familyId, item.folderId);
  await VaultItem.updateOne({ _id: item._id, ...ANY_STATE }, { $set: { deletedAt: null, deletedBy: null, folderId } });
  return { ...item, folderId };
}

/**
 * Restores one file (by the file subdoc's id) back into its document. If the document itself is
 * in the bin too, it is restored along with the file (via restoreDocument, so its binned folder
 * chain comes back as well) — same "restoring something brings back what it lives in" rule as a
 * document inside a binned folder, rather than making the user restore the document first. The
 * document's OTHER binned files stay in the bin. Returns `{ document, file, documentRestored }`.
 */
export async function restoreFile(familyId, fileId) {
  const fileObjectId = toObjectIdOrNotInBin(fileId);
  const doc = await Document.findOne(scopeToFamily(familyId, binnedFileFilter(fileObjectId))).lean();
  if (!doc) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
  const file = doc.files.find((f) => f._id.equals(fileObjectId));

  let { folderId } = doc;
  const documentRestored = Boolean(doc.deletedAt);
  if (documentRestored) ({ folderId } = await restoreDocument(familyId, doc._id));

  await Document.updateOne(
    { _id: doc._id, familyId: doc.familyId, 'files._id': fileObjectId, ...ANY_STATE },
    { $set: { 'files.$.deletedAt': null, 'files.$.deletedBy': null } },
  );
  return { document: { ...doc, folderId }, file, documentRestored };
}

/**
 * Restores a folder AND its whole soft-deleted subtree (mirroring the symmetric delete cascade in
 * modules/folders/routes.js) — every descendant folder, and every document/item inside any of
 * them, comes back together. Also restores the folder's own ancestor chain, in case a parent
 * above it is separately still in the bin.
 */
export async function restoreFolder(familyId, folderId) {
  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId, ...ANY_STATE })).lean();
  if (!folder || !folder.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');

  const folderIds = await getDescendantFolderIds(familyId, folder._id, { includeDeleted: true });
  await Folder.updateMany(
    scopeToFamily(familyId, { _id: { $in: folderIds }, ...ANY_STATE }),
    { $set: { deletedAt: null, deletedBy: null } },
  );
  await Document.updateMany(
    scopeToFamily(familyId, { folderId: { $in: folderIds }, ...ANY_STATE }),
    { $set: { deletedAt: null, deletedBy: null } },
  );
  await VaultItem.updateMany(
    scopeToFamily(familyId, { folderId: { $in: folderIds }, ...ANY_STATE }),
    { $set: { deletedAt: null, deletedBy: null } },
  );

  if (folder.parentId) {
    const parent = await Folder.findOne(scopeToFamily(familyId, { _id: folder.parentId, ...ANY_STATE })).select('_id').lean();
    if (parent) {
      await restoreAncestorFolders(familyId, folder.parentId);
    } else {
      // Its parent was permanently purged — bring it back at the top level instead.
      await Folder.updateOne({ _id: folder._id, ...ANY_STATE }, { $set: { parentId: null } });
    }
  }
  return folder;
}

/** Deletes files' bytes (original + thumbnail) from storage and frees them from the family's quota. */
async function purgeFileBlobs(familyId, files) {
  const storage = await getStorage();
  const keys = files.flatMap((f) => [f.storageKey, f.thumbKey]);
  const freedBytes = await totalStoredBytes(storage, keys);
  await Promise.all(
    files.flatMap((f) => {
      const deletes = [storage.delete(f.storageKey).catch(() => {})];
      if (f.thumbKey) deletes.push(storage.delete(f.thumbKey).catch(() => {}));
      return deletes;
    }),
  );
  await adjustFamilyStorageBytes(familyId, -freedBytes);
}

/** Every file of a document — including ones already in the bin on their own. */
async function purgeDocumentFiles(familyId, doc) {
  await purgeFileBlobs(familyId, doc.files || []);
}

/**
 * PERMANENTLY removes one bin entry — the only place in the app that ever calls
 * `storage.delete()` or a Mongoose `deleteOne`/`deleteMany` for a document/folder/item (or pulls
 * a binned file out of its document). Only ever
 * reachable via the platform-owner-gated routes (modules/platform/routes.js). Purging a folder
 * cascades to its whole soft-deleted subtree, same shape as the old (pre-soft-delete) recursive
 * hard-delete this replaced. Throws 404 NOT_IN_BIN if the row isn't actually in a family's bin —
 * this must never be able to remove an active row, even if asked to.
 */
export async function permanentlyPurgeOne(familyId, type, id) {
  if (type === 'file') {
    // `id` is the file subdoc's id. Works whether or not its document is itself in the bin.
    const fileObjectId = toObjectIdOrNotInBin(id);
    const doc = await Document.findOne(scopeToFamily(familyId, binnedFileFilter(fileObjectId))).lean();
    if (!doc) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
    const file = doc.files.find((f) => f._id.equals(fileObjectId));
    await purgeFileBlobs(familyId, [file]);
    await Document.updateOne({ _id: doc._id, familyId: doc.familyId, ...ANY_STATE }, { $pull: { files: { _id: fileObjectId } } });
    return;
  }

  if (type === 'document') {
    const doc = await Document.findOne({ _id: id, familyId, ...ANY_STATE }).lean();
    if (!doc || !doc.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
    await purgeDocumentFiles(familyId, doc);
    await Document.deleteOne({ _id: doc._id });
    return;
  }

  if (type === 'item') {
    const item = await VaultItem.findOne({ _id: id, familyId, ...ANY_STATE }).lean();
    if (!item || !item.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');
    await VaultItem.deleteOne({ _id: item._id });
    return;
  }

  if (type === 'folder') {
    const folder = await Folder.findOne({ _id: id, familyId, ...ANY_STATE }).lean();
    if (!folder || !folder.deletedAt) throw new ApiError(404, 'NOT_IN_BIN', 'Not found in the bin');

    const folderIds = await getDescendantFolderIds(familyId, folder._id, { includeDeleted: true });
    const documents = await Document.find(scopeToFamily(familyId, { folderId: { $in: folderIds }, ...DELETED_ONLY })).lean();
    for (const doc of documents) {
      // eslint-disable-next-line no-await-in-loop
      await purgeDocumentFiles(familyId, doc);
    }
    await Document.deleteMany(scopeToFamily(familyId, { folderId: { $in: folderIds }, ...DELETED_ONLY }));
    await VaultItem.deleteMany(scopeToFamily(familyId, { folderId: { $in: folderIds }, ...DELETED_ONLY }));
    await Folder.deleteMany(scopeToFamily(familyId, { _id: { $in: folderIds }, ...DELETED_ONLY }));
    return;
  }

  throw new ApiError(400, 'VALIDATION_ERROR', `Unknown bin entry type: ${type}`);
}
