import { ApiError } from '../../middleware/errorHandler.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { getItemForShare } from '../items/integration.js';

/** expiresIn code -> duration in ms. 'never' is handled separately (expiresAt: null). */
export const EXPIRES_IN_MS = {
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** The only expiresIn codes allowed alongside includeSensitive:true (docs/API.md: "<=24h, never 'never'"). */
export const SHORT_EXPIRY_CODES = new Set(['1h', '2h', '24h']);

/**
 * Pure function: expiresIn code -> Date, or null for 'never'. `from` is injectable for tests.
 * Throws ApiError(400) for an unrecognized code (should already be caught by zod enum upstream,
 * this is a defensive backstop for internal callers like PATCH's extendTo).
 */
export function computeExpiresAt(expiresIn, from = Date.now()) {
  if (expiresIn === 'never') return null;
  const ms = EXPIRES_IN_MS[expiresIn];
  if (!ms) throw new ApiError(400, 'VALIDATION_ERROR', `Invalid expiresIn: ${expiresIn}`);
  return new Date(from + ms);
}

/**
 * Hard invariants around includeSensitive — MUST be called before any DB write.
 *  - targetType 'folder' may never set includeSensitive:true -> 400 FOLDER_SHARE_NO_SENSITIVE
 *  - includeSensitive:true requires a non-empty password AND expiresIn in {1h,2h,24h} ->
 *    400 INVALID_SENSITIVE_SHARE otherwise
 * Pure (no I/O), so it's unit-testable without a DB.
 */
export function assertSensitiveInvariants({ targetType, includeSensitive, password, expiresIn }) {
  if (!includeSensitive) return;

  if (targetType === 'folder') {
    throw new ApiError(400, 'FOLDER_SHARE_NO_SENSITIVE', 'Folder shares can never include sensitive values');
  }

  const hasPassword = typeof password === 'string' && password.length > 0;
  if (!hasPassword || !SHORT_EXPIRY_CODES.has(expiresIn)) {
    throw new ApiError(
      400,
      'INVALID_SENSITIVE_SHARE',
      'includeSensitive requires a password and an expiry of 24h or less',
    );
  }
}

/** Loads the share's target (Document/Folder/Item) scoped to the family. Returns null if missing. */
export async function loadTarget(familyId, targetType, targetId) {
  if (targetType === 'document') {
    return Document.findOne(scopeToFamily(familyId, { _id: targetId })).lean();
  }
  if (targetType === 'folder') {
    return Folder.findOne(scopeToFamily(familyId, { _id: targetId })).lean();
  }
  if (targetType === 'item') {
    return getItemForShare(familyId, targetId, { includeSensitive: false });
  }
  return null;
}

/** Human label for a loaded target, used as Share.targetLabel (not persisted — resolved on read). */
export function targetLabelFrom(targetType, target) {
  if (!target) return null;
  if (targetType === 'document') return target.title || null;
  if (targetType === 'folder') return target.name || null;
  return target.title || target.name || target.label || null;
}

/**
 * Batch-resolves target labels for a list of shares (avoids N+1 by grouping per targetType).
 * Returns a lookup function `(share) => label|null`.
 */
export async function resolveTargetLabels(familyId, shares) {
  const documentIds = [];
  const folderIds = [];
  const itemIds = [];
  for (const s of shares) {
    if (s.targetType === 'document') documentIds.push(String(s.targetId));
    else if (s.targetType === 'folder') folderIds.push(String(s.targetId));
    else if (s.targetType === 'item') itemIds.push(String(s.targetId));
  }

  const [docs, folders] = await Promise.all([
    documentIds.length
      ? Document.find(scopeToFamily(familyId, { _id: { $in: documentIds } })).select('title').lean()
      : Promise.resolve([]),
    folderIds.length
      ? Folder.find(scopeToFamily(familyId, { _id: { $in: folderIds } })).select('name').lean()
      : Promise.resolve([]),
  ]);
  const docMap = new Map(docs.map((d) => [String(d._id), d.title]));
  const folderMap = new Map(folders.map((f) => [String(f._id), f.name]));

  // The items integration seam has no batch-lookup API today — sequential is fine at this scale
  // (a family's share list is small) and keeps the integration.js contract untouched.
  const itemMap = new Map();
  for (const id of itemIds) {
    // eslint-disable-next-line no-await-in-loop
    const item = await getItemForShare(familyId, id, { includeSensitive: false });
    itemMap.set(id, targetLabelFrom('item', item));
  }

  return (share) => {
    const id = String(share.targetId);
    if (share.targetType === 'document') return docMap.get(id) ?? null;
    if (share.targetType === 'folder') return folderMap.get(id) ?? null;
    return itemMap.get(id) ?? null;
  };
}

/**
 * Serializes a Share (accepts either a lean object or a hydrated Mongoose doc — both expose the
 * same plain fields) into the docs/API.md `Share` shape. `url` is only ever passed on create.
 */
export function serializeShare(share, { url, targetLabel = null } = {}) {
  return {
    id: String(share._id),
    targetType: share.targetType,
    targetId: String(share.targetId),
    targetLabel,
    label: share.label || '',
    expiresAt: share.expiresAt,
    allowDownload: share.allowDownload,
    includeSensitive: share.includeSensitive,
    hasPassword: !!share.passwordHash,
    revokedAt: share.revokedAt,
    openCount: share.openCount,
    downloadCount: share.downloadCount,
    lastOpenedAt: share.lastOpenedAt,
    createdAt: share.createdAt,
    ...(url ? { url } : {}),
  };
}
