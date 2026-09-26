import { Folder } from '../../models/Folder.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { ApiError } from '../../middleware/errorHandler.js';

/** Stored name of the one system folder every family has (the client shows "साझा" in Hindi). */
const SHARED_FOLDER_NAME = 'Shared';
/** What Hindi readers see for it — search matches this too. */
export const SHARED_FOLDER_NAME_HI = 'साझा';
const SHARED_SYSTEM_KEY = 'shared';

const RESERVED_FOLDER_NAMES = new Set([SHARED_FOLDER_NAME, SHARED_FOLDER_NAME_HI].map((n) => n.normalize('NFC').toLowerCase()));

/**
 * True when `name` would read as the family's Shared folder ("Shared" / "साझा", trimmed, any
 * case) — no user folder may use it, at any level, so there's only ever one "Shared".
 */
export function isReservedFolderName(name) {
  return RESERVED_FOLDER_NAMES.has(String(name ?? '').trim().normalize('NFC').toLowerCase());
}

/** Separator used in human-readable folder paths, e.g. "Shared › Papa". */
const PATH_SEPARATOR = ' › ';

/**
 * Returns the family's Shared folder (lean), creating it if it doesn't exist yet. Race-safe: an
 * upsert against the unique `{ familyId, systemKey }` index, so two concurrent callers always end
 * up with the same single folder.
 */
export async function ensureSharedFolder(familyId) {
  const filter = { familyId, systemKey: SHARED_SYSTEM_KEY };
  const update = {
    $setOnInsert: {
      familyId,
      name: SHARED_FOLDER_NAME,
      parentId: null,
      isSystem: true,
      systemKey: SHARED_SYSTEM_KEY,
      createdBy: null,
    },
  };
  try {
    return await Folder.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  } catch (err) {
    // Lost an upsert race against the unique index — the winner's folder is there now.
    if (err?.code === 11000) return Folder.findOne(filter).lean();
    throw err;
  }
}

/** The family's Shared folder id as a string (creates the folder if it is missing). */
export async function getSharedFolderId(familyId) {
  const folder = await ensureSharedFolder(familyId);
  return String(folder._id);
}

/** True for the Shared system folder (works on lean docs and hydrated ones). */
export function isSystemFolder(folder) {
  return Boolean(folder?.isSystem);
}

/**
 * Map(folderId string -> "Shared › Papa" style breadcrumb path) for every active folder in the
 * family. One query; paths are built in memory by walking parentId links (depth-capped so a
 * corrupt cycle can never loop forever).
 */
export async function buildFolderPaths(familyId) {
  const folders = await Folder.find(scopeToFamily(familyId)).select('_id name parentId').lean();
  const byId = new Map(folders.map((f) => [String(f._id), f]));
  const paths = new Map();

  function pathOf(id, depth = 0) {
    if (paths.has(id)) return paths.get(id);
    const folder = byId.get(id);
    if (!folder) return '';
    const parentId = folder.parentId ? String(folder.parentId) : null;
    const parentPath = parentId && depth < 50 ? pathOf(parentId, depth + 1) : '';
    const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${folder.name}` : folder.name;
    paths.set(id, path);
    return path;
  }

  for (const id of byId.keys()) pathOf(id);
  return paths;
}

/**
 * The folder something is being added to / moved into: the given folder (must exist in this
 * family, else 404 FOLDER_NOT_FOUND) or — when omitted, null or 'root' — the Shared folder.
 * Returns the lean folder doc.
 */
export async function resolveTargetFolder(familyId, rawFolderId) {
  if (!rawFolderId || rawFolderId === 'root') return ensureSharedFolder(familyId);
  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: rawFolderId })).lean();
  if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
  return folder;
}
