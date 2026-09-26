import express from 'express';
import { z } from 'zod';

import { VaultItem } from '../../models/VaultItem.js';
import { Folder } from '../../models/Folder.js';
import { Activity } from '../../models/Activity.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { sealText } from '../documents/secretText.js';
import { shouldLogView } from '../documents/viewThrottle.js';
import { buildBreadcrumbs } from '../folders/folderTree.js';
import { resolveTargetFolder } from '../folders/sharedFolder.js';
import { serializeItemSummary, serializeItemDetail } from './serializer.js';
import { authorNames } from '../../utils/memberNames.js';
import { isSensitiveKey } from './sensitiveKey.js';

// Vault items: 'login' (a saved password: username, password, extra key/value fields, notes) and
// 'note' (title + notes). Every value is encrypted at rest; members get plain text back.
const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const kindEnum = z.enum(['login', 'note']);
// Omitted, `null` or `'root'` all mean "the Shared folder".
const folderIdInput = z.union([objectId, z.literal('root')]).nullable();

const fieldInputSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number()]).optional().default(''),
  // "Keep secret". Omitted = secret when the key looks sensitive ("ATM PIN", "UPI password"…).
  secret: z.boolean().optional(),
});

const createItemSchema = z.object({
  kind: kindEnum,
  title: z.string().trim().min(1).max(200),
  folderId: folderIdInput.optional(),
  username: z.string().max(500).optional().default(''),
  password: z.string().max(1000).optional().default(''),
  fields: z.array(fieldInputSchema).max(50).optional().default([]),
  notes: z.string().max(20000).optional().default(''),
});

const patchItemSchema = z.object({
  kind: kindEnum.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  folderId: folderIdInput.optional(),
  username: z.string().max(500).optional(),
  password: z.string().max(1000).optional(),
  fields: z.array(fieldInputSchema).max(50).optional(),
  notes: z.string().max(20000).optional(),
});

const listQuerySchema = z.object({
  folderId: objectId.optional(),
  kind: kindEnum.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const idParamSchema = z.object({ id: objectId });

function sealFields(fields) {
  return (fields || []).map((f) => ({
    key: f.key,
    value: sealText(String(f.value ?? '')),
    secret: f.secret ?? isSensitiveKey(f.key),
  }));
}

/** A note has only a title and notes — drop any login-only values it may have carried. */
function clearLoginOnlyValues(item) {
  item.username = '';
  item.password = '';
  item.fields = [];
}

async function loadBreadcrumbs(familyId, item) {
  const folder = item.folderId
    ? await Folder.findOne(scopeToFamily(familyId, { _id: item.folderId })).lean()
    : null;
  return buildBreadcrumbs(familyId, folder);
}

router.use(requireAuth, requireFamily);

/** GET /items?folderId=&kind=&page=&limit= — newest first; never includes passwords. */
router.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const { folderId, kind, page, limit } = req.query;

    const filter = scopeToFamily(familyId, {});
    if (folderId) filter.folderId = folderId;
    if (kind) filter.kind = kind;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      VaultItem.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      VaultItem.countDocuments(filter),
    ]);

    res.json({
      items: items.map(serializeItemSummary),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /items/:id — full item including the plain-text password. */
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    if (shouldLogView(membershipId, String(item._id))) {
      await logActivity(req, {
        action: 'item.view',
        targetType: 'item',
        targetId: item._id,
        folderId: item.folderId,
        meta: { title: item.title, kind: item.kind },
      });
    }

    const breadcrumbs = await loadBreadcrumbs(familyId, item);
    const authors = await authorNames(familyId, item);
    res.json({ ...serializeItemDetail(item, { breadcrumbs }), ...authors });
  } catch (err) {
    next(err);
  }
});

/** POST /items — `{ kind, title, folderId?, username?, password?, fields?, notes? }`. */
router.post('/', requireWrite, validate({ body: createItemSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const data = req.body;
    const folder = await resolveTargetFolder(familyId, data.folderId);
    const isLogin = data.kind === 'login';

    const item = await VaultItem.create({
      familyId,
      folderId: folder._id,
      kind: data.kind,
      title: data.title,
      username: isLogin ? sealText(data.username) : '',
      password: isLogin ? sealText(data.password) : '',
      fields: isLogin ? sealFields(data.fields) : [],
      notes: sealText(data.notes),
      createdBy: membershipId,
    });

    await logActivity(req, {
      action: 'item.create',
      targetType: 'item',
      targetId: item._id,
      folderId: item.folderId,
      meta: { title: item.title, kind: item.kind },
    });

    const breadcrumbs = await buildBreadcrumbs(familyId, folder);
    res.status(201).json(serializeItemDetail(item.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/** PATCH /items/:id — same fields as POST, all optional; `fields` (if sent) replaces the list. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchItemSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    const body = req.body;
    if (body.folderId !== undefined) {
      const folder = await resolveTargetFolder(familyId, body.folderId);
      item.folderId = folder._id;
    }
    if (body.kind !== undefined) item.kind = body.kind;
    if (body.title !== undefined) item.title = body.title;
    if (body.notes !== undefined) item.notes = sealText(body.notes);

    if (item.kind === 'login') {
      if (body.username !== undefined) item.username = sealText(body.username);
      if (body.password !== undefined) item.password = sealText(body.password);
      if (body.fields !== undefined) item.fields = sealFields(body.fields);
    } else {
      clearLoginOnlyValues(item);
    }

    item.updatedBy = membershipId;
    await item.save();

    // Only field NAMES are logged — never a value.
    await logActivity(req, {
      action: 'item.update',
      targetType: 'item',
      targetId: item._id,
      folderId: item.folderId,
      meta: { title: item.title, fields: Object.keys(body) },
    });

    const breadcrumbs = await loadBreadcrumbs(familyId, item);
    res.json(serializeItemDetail(item.toObject(), { breadcrumbs }));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /items/:id — SOFT delete (docs/DECISIONS.md "Soft delete / recycle bin"): moves the item
 * into the family's Bin instead of removing it. Only the platform admin's permanent-delete action
 * ever calls VaultItem.deleteOne() for a user-initiated delete.
 */
router.delete('/:id', requireWrite, validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    await VaultItem.updateOne({ _id: item._id }, { $set: { deletedAt: new Date(), deletedBy: membershipId } });

    await logActivity(req, {
      action: 'item.delete',
      targetType: 'item',
      targetId: item._id,
      folderId: item.folderId,
      meta: { title: item.title, kind: item.kind },
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** GET /items/:id/activity — this item only. */
router.get('/:id/activity', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    const rows = await Activity.find(scopeToFamily(familyId, { targetType: 'item', targetId: item._id }))
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      items: rows.map((a) => ({
        id: a._id.toString(),
        actorName: a.actorName,
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId ? a.targetId.toString() : null,
        meta: a.meta,
        createdAt: a.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
