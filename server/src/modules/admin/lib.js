import mongoose from 'mongoose';
import { z } from 'zod';

import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { Document } from '../../models/Document.js';
import { VaultItem } from '../../models/VaultItem.js';
import { Folder } from '../../models/Folder.js';
import { Activity } from '../../models/Activity.js';
import { PlatformAdmin } from '../../models/PlatformAdmin.js';
import { ANY_DELETED_STATE } from '../../models/plugins/softDelete.js';
import { shareStatus } from '../shares/lib.js';
import { isSuperAdminEmail } from '../../services/platformRoles.js';

// PRIVACY (docs/ADMIN_API.md "Privacy rule"): every row below is built field-by-field from an
// explicit `.select()` projection. Nothing here ever reads file keys/encryption, encrypted
// values, notes, passwords, token hashes or password hashes — so they can't leak by accident.

const MAX_LIMIT = 100;

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const idParams = z.object({ id: objectIdSchema });

/** `limit` is capped at 100 (not rejected) so a client asking for more still gets a page. */
export const limitSchema = (def) =>
  z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(def)
    .transform((v) => Math.min(v, MAX_LIMIT));

export const pageQuery = {
  page: z.coerce.number().int().positive().optional().default(1),
  limit: limitSchema(20),
};

/** Escape user input before using it inside a RegExp. */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const oid = (v) => new mongoose.Types.ObjectId(String(v));
const str = (v) => (v == null ? null : String(v));
const uniq = (arr) => [...new Set(arr.filter(Boolean).map(String))];

async function mapById(Model, ids, fields, extraFilter = {}) {
  const list = uniq(ids);
  if (!list.length) return new Map();
  const rows = await Model.find({ _id: { $in: list }, ...extraFilter }).select(fields).lean();
  return new Map(rows.map((r) => [String(r._id), r]));
}

/* ------------------------------------------------------------------ activity */

function targetTitleFrom(meta) {
  if (!meta || typeof meta !== 'object') return null;
  for (const key of ['targetTitle', 'title', 'name', 'originalName']) {
    if (typeof meta[key] === 'string' && meta[key]) return meta[key];
  }
  return null;
}

/** Activity docs (lean) -> ActivityRow[]; batched lookups, no N+1. */
export async function buildActivityRows(rows) {
  const memberships = await mapById(
    Membership,
    rows.map((r) => r.actorMembershipId),
    'name userId',
  );
  const userIds = [
    ...[...memberships.values()].map((m) => m.userId),
    ...rows.map((r) => r.meta?.actorUserId),
  ];
  const [users, families] = await Promise.all([
    mapById(User, userIds, 'name email'),
    mapById(Family, rows.map((r) => r.familyId), 'name'),
  ]);

  return rows.map((r) => {
    let actor = null;
    const adminUser = r.meta?.actorUserId ? users.get(String(r.meta.actorUserId)) : null;
    const m = r.actorMembershipId ? memberships.get(String(r.actorMembershipId)) : null;
    if (adminUser) {
      actor = { id: str(adminUser._id), name: adminUser.name, email: adminUser.email };
    } else if (m) {
      const u = m.userId ? users.get(String(m.userId)) : null;
      actor = { id: u ? str(u._id) : null, name: m.name, email: u?.email ?? null };
    } else if (r.actorName && r.actorName !== 'Visitor') {
      actor = { id: null, name: r.actorName, email: null };
    }
    const fam = r.familyId ? families.get(String(r.familyId)) : null;
    return {
      id: str(r._id),
      at: r.createdAt,
      action: r.action,
      actor,
      family: r.familyId ? { id: str(r.familyId), name: fam?.name ?? null } : null,
      targetType: r.targetType ?? null,
      targetTitle: targetTitleFrom(r.meta),
    };
  });
}

/** Everything a user did or that happened to them: their memberships' rows, admin rows, logins. */
export async function activityFilterForUser(userId) {
  const uid = oid(userId);
  const memberships = await Membership.find({ userId: uid }).select('_id').lean();
  return {
    $or: [
      { actorMembershipId: { $in: memberships.map((m) => m._id) } },
      { 'meta.actorUserId': uid },
      { targetType: 'user', targetId: uid },
    ],
  };
}

export async function recentActivity(filter, limit) {
  const rows = await Activity.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .select('familyId actorMembershipId actorName action targetType meta createdAt')
    .lean();
  return buildActivityRows(rows);
}

/* ---------------------------------------------------------------------- users */

export const USER_FIELDS = 'name email createdAt lastLoginAt disabled authProviders';

/** User docs (lean, USER_FIELDS) -> UserRow[]. */
export async function buildUserRows(users) {
  if (!users.length) return [];
  const ids = users.map((u) => u._id);
  const [memberships, admins] = await Promise.all([
    Membership.find({ userId: { $in: ids }, status: { $ne: 'invited' } })
      .select('familyId userId role access')
      .lean(),
    PlatformAdmin.find({ email: { $in: users.map((u) => u.email) } }).select('email').lean(),
  ]);
  const families = await mapById(Family, memberships.map((m) => m.familyId), 'name');
  const adminEmails = new Set(admins.map((a) => a.email));

  return users.map((u) => ({
    id: str(u._id),
    name: u.name,
    email: u.email,
    createdAt: u.createdAt ?? null,
    lastLoginAt: u.lastLoginAt ?? null,
    disabled: Boolean(u.disabled),
    authProviders: u.authProviders || [],
    isSuperAdmin: isSuperAdminEmail(u.email),
    isAdmin: adminEmails.has(u.email),
    families: memberships
      .filter((m) => String(m.userId) === String(u._id))
      .map((m) => ({
        id: str(m.familyId),
        name: families.get(String(m.familyId))?.name ?? null,
        role: m.role,
        access: m.access,
      })),
  }));
}

/* ------------------------------------------------------------------- families */

export const FAMILY_FIELDS = 'name createdAt createdBy storageBytes';

const countMap = (rows, key = 'n') => new Map(rows.map((r) => [String(r._id), r[key]]));

/** Family docs (lean, FAMILY_FIELDS) -> FamilyRow[]; one aggregation per collection per page. */
export async function buildFamilyRows(families) {
  if (!families.length) return [];
  const ids = families.map((f) => f._id);
  const notDeleted = { familyId: { $in: ids }, deletedAt: null }; // aggregate skips the soft-delete hook

  const [owners, members, docs, items, folders, lastActs] = await Promise.all([
    Membership.find({ familyId: { $in: ids }, isOwner: true }).select('familyId userId').lean(),
    Membership.aggregate([
      { $match: { familyId: { $in: ids }, status: { $ne: 'invited' } } },
      { $group: { _id: '$familyId', n: { $sum: 1 } } },
    ]),
    Document.aggregate([
      { $match: notDeleted },
      {
        $group: {
          _id: '$familyId',
          documents: { $sum: 1 },
          // Files moved to the Bin (deletedAt set) don't count.
          files: { $sum: { $size: { $filter: { input: { $ifNull: ['$files', []] }, as: 'f', cond: { $not: [{ $ifNull: ['$$f.deletedAt', false] }] } } } } },
        },
      },
    ]),
    VaultItem.aggregate([
      { $match: notDeleted },
      { $group: { _id: { f: '$familyId', k: '$kind' }, n: { $sum: 1 } } },
    ]),
    Folder.aggregate([{ $match: notDeleted }, { $group: { _id: '$familyId', n: { $sum: 1 } } }]),
    Promise.all(
      ids.map((id) => Activity.findOne({ familyId: id }).sort({ createdAt: -1 }).select('createdAt').lean()),
    ),
  ]);

  const ownerByFamily = new Map(owners.map((o) => [String(o.familyId), o.userId]));
  const ownerUsers = await mapById(
    User,
    families.map((f) => ownerByFamily.get(String(f._id)) || f.createdBy),
    'name email',
  );
  const memberCounts = countMap(members);
  const docCounts = new Map(docs.map((d) => [String(d._id), d]));
  const folderCounts = countMap(folders);
  const itemCounts = new Map(items.map((i) => [`${i._id.f}:${i._id.k}`, i.n]));

  return families.map((f, idx) => {
    const key = String(f._id);
    const ou = ownerUsers.get(String(ownerByFamily.get(key) || f.createdBy));
    return {
      id: key,
      name: f.name,
      createdAt: f.createdAt ?? null,
      owner: ou ? { id: str(ou._id), name: ou.name, email: ou.email } : null,
      members: memberCounts.get(key) || 0,
      documents: docCounts.get(key)?.documents || 0,
      files: docCounts.get(key)?.files || 0,
      passwords: itemCounts.get(`${key}:login`) || 0,
      notes: itemCounts.get(`${key}:note`) || 0,
      folders: folderCounts.get(key) || 0,
      storageBytes: f.storageBytes || 0,
      lastActivityAt: lastActs[idx]?.createdAt ?? null,
    };
  });
}

/* --------------------------------------------------------------------- shares */

// NEVER tokenHash / fileIds — only what ShareRow needs.
export const SHARE_FIELDS = 'familyId targetType targetId expiresAt revokedAt openCount lastOpenedAt createdBy createdAt';

/** Share docs (lean, SHARE_FIELDS) -> ShareRow[]. */
export async function buildShareRows(shares) {
  if (!shares.length) return [];
  const byType = (t) => shares.filter((s) => s.targetType === t).map((s) => s.targetId);
  const [families, docs, folders, creators] = await Promise.all([
    mapById(Family, shares.map((s) => s.familyId), 'name'),
    // Include binned targets so the title still shows.
    mapById(Document, byType('document'), 'title', ANY_DELETED_STATE),
    mapById(Folder, byType('folder'), 'name', ANY_DELETED_STATE),
    mapById(Membership, shares.map((s) => s.createdBy), 'name userId'),
  ]);
  const users = await mapById(User, [...creators.values()].map((m) => m.userId), 'email');

  const now = Date.now();
  return shares.map((s) => {
    const target = s.targetType === 'document' ? docs.get(String(s.targetId)) : folders.get(String(s.targetId));
    const creator = creators.get(String(s.createdBy));
    return {
      id: str(s._id),
      family: { id: str(s.familyId), name: families.get(String(s.familyId))?.name ?? null },
      targetType: s.targetType,
      targetTitle: target ? target.title ?? target.name ?? null : null,
      createdBy: creator
        ? { name: creator.name, email: creator.userId ? users.get(String(creator.userId))?.email ?? null : null }
        : null,
      createdAt: s.createdAt ?? null,
      expiresAt: s.expiresAt ?? null,
      revokedAt: s.revokedAt ?? null,
      opens: s.openCount || 0,
      lastOpenedAt: s.lastOpenedAt ?? null,
      // Share links have no password option in this app (models/Share.js) — always false.
      hasPassword: false,
      status: shareStatus(s, now),
    };
  });
}

/** Mongo filter for a ShareRow status. */
export function shareStatusFilter(status, now = new Date()) {
  if (status === 'active') return { revokedAt: null, expiresAt: { $gt: now } };
  if (status === 'expired') return { revokedAt: null, expiresAt: { $lte: now } };
  if (status === 'revoked') return { revokedAt: { $ne: null } };
  return {};
}
