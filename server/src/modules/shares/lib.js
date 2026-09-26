import { ApiError } from '../../middleware/errorHandler.js';
import { scopeToFamily } from '../../middleware/auth.js';
import { Document } from '../../models/Document.js';
import { Folder } from '../../models/Folder.js';
import { ANY_DELETED_STATE } from '../../models/plugins/softDelete.js';

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
 * Batch-resolves target labels for a list of shares (one query per target type), including
 * targets that are in the Bin, so the Shares page can still name them.
 * Returns `{ labelFor: (share) => label|null, inBin: (share) => boolean }`.
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
      ? Document.find(scopeToFamily(familyId, { _id: { $in: documentIds }, ...ANY_DELETED_STATE })).select('title deletedAt').lean()
      : [],
    folderIds.length
      ? Folder.find(scopeToFamily(familyId, { _id: { $in: folderIds }, ...ANY_DELETED_STATE })).select('name deletedAt').lean()
      : [],
  ]);
  const docMap = new Map(docs.map((d) => [String(d._id), { label: d.title, deleted: Boolean(d.deletedAt) }]));
  const folderMap = new Map(folders.map((f) => [String(f._id), { label: f.name, deleted: Boolean(f.deletedAt) }]));
  const find = (share) => (share.targetType === 'document' ? docMap : folderMap).get(String(share.targetId));

  return {
    labelFor: (share) => find(share)?.label ?? null,
    inBin: (share) => Boolean(find(share)?.deleted),
  };
}

/** Share -> API shape. `url` is only ever passed on create (the raw token is never stored). */
export function serializeShare(share, { url, targetLabel = null, targetInBin = false } = {}) {
  return {
    id: String(share._id),
    targetType: share.targetType,
    targetId: String(share.targetId),
    targetLabel,
    targetInBin,
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
