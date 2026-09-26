import { ApiError } from '../../middleware/errorHandler.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';

/** Share duration code -> milliseconds. Codes match Family SHARE_DURATIONS. */
const DURATION_MS = {
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

/** Pure: duration code -> expiry Date. `from` is injectable for tests. */
export function computeExpiresAt(duration, from = Date.now()) {
  const ms = DURATION_MS[duration];
  if (!ms) throw new ApiError(400, 'VALIDATION_ERROR', `Invalid duration: ${duration}`);
  return new Date(from + ms);
}

/** 'active' | 'expired' | 'revoked' — computed, never stored. */
export function shareStatus(share, now = Date.now()) {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now) return 'expired';
  return 'active';
}

/** Loads the share's target (Document/Folder) scoped to the family. Returns null if missing. */
export async function loadTarget(familyId, targetType, targetId) {
  if (targetType === 'document') {
    return Document.findOne(scopeToFamily(familyId, { _id: targetId })).select('title files._id files.deletedAt').lean();
  }
  if (targetType === 'folder') {
    return Folder.findOne(scopeToFamily(familyId, { _id: targetId })).select('name').lean();
  }
  return null;
}

/** Human label for a loaded target (document title / folder name). */
export function targetLabelFrom(targetType, target) {
  if (!target) return null;
  return targetType === 'folder' ? target.name || null : target.title || null;
}

/**
 * Batch-resolves target labels for a list of shares (one query per target type).
 * Returns a lookup function `(share) => label|null`.
 */
export async function resolveTargetLabels(familyId, shares) {
  const documentIds = [];
  const folderIds = [];
  for (const s of shares) {
    if (s.targetType === 'document') documentIds.push(String(s.targetId));
    else if (s.targetType === 'folder') folderIds.push(String(s.targetId));
  }

  const [docs, folders] = await Promise.all([
    documentIds.length
      ? Document.find(scopeToFamily(familyId, { _id: { $in: documentIds } })).select('title').lean()
      : [],
    folderIds.length
      ? Folder.find(scopeToFamily(familyId, { _id: { $in: folderIds } })).select('name').lean()
      : [],
  ]);
  const docMap = new Map(docs.map((d) => [String(d._id), d.title]));
  const folderMap = new Map(folders.map((f) => [String(f._id), f.name]));

  return (share) => {
    const id = String(share.targetId);
    if (share.targetType === 'document') return docMap.get(id) ?? null;
    return folderMap.get(id) ?? null;
  };
}

/** Share -> API shape. `url` is only ever passed on create (the raw token is never stored). */
export function serializeShare(share, { url, targetLabel = null } = {}) {
  return {
    id: String(share._id),
    targetType: share.targetType,
    targetId: String(share.targetId),
    targetLabel,
    fileIds: (share.fileIds || []).map(String),
    duration: share.duration,
    expiresAt: share.expiresAt,
    status: shareStatus(share),
    revokedAt: share.revokedAt,
    openCount: share.openCount,
    downloadCount: share.downloadCount,
    lastOpenedAt: share.lastOpenedAt,
    createdBy: share.createdBy ? String(share.createdBy) : null,
    createdAt: share.createdAt,
    ...(url ? { url } : {}),
  };
}
