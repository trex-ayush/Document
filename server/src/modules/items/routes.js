import express from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';

import { VaultItem } from '../../models/VaultItem.js';
import { Folder } from '../../models/Folder.js';
import { Membership } from '../../models/Membership.js';
import { Family } from '../../models/Family.js';
import { Activity } from '../../models/Activity.js';
import { requireAuth, requireFamily, requireWrite, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { encryptFieldValue, decryptFieldValue } from '../../utils/crypto.js';
import { verifyReauthToken } from '../../utils/tokens.js';
import { serializeItemSummary, serializeItemDetail } from './serializer.js';

// OWNED BY THE ITEMS AGENT (not Agent A/B/C/D). Builds VaultItem (login/record/note "items")
// as its own module: server/src/modules/items/** + server/src/models/VaultItem.js. See
// docs/API.md "Items" and docs/ITEMS.md for the full contract.
const router = express.Router();

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const kindEnum = z.enum(['login', 'record', 'note']);
const fieldTypeEnum = z.enum(['text', 'number', 'date', 'email', 'phone', 'url']);

const itemFieldInputSchema = z.object({
  key: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.number()]).optional().default(''),
  type: fieldTypeEnum.optional().default('text'),
  sensitive: z.boolean().optional().default(false),
});

const createItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  folderId: objectId,
  kind: kindEnum,
  memberId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional().default([]),
  fields: z.array(itemFieldInputSchema).optional().default([]),
});

const patchItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  folderId: objectId.optional(),
  kind: kindEnum.optional(),
  memberId: objectId.nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).optional(),
  fields: z.array(itemFieldInputSchema).optional(),
});

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  folderId: z.string().optional(),
  kind: kindEnum.optional(),
  memberId: objectId.optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const idParamSchema = z.object({ id: objectId });
const fieldIdParamSchema = z.object({ id: objectId, fieldId: objectId });

// Rate-limited per member, matching documents/routes.js's reveal endpoint.
const revealLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.auth?.membershipId || req.ip,
});

/** Sensitive fields are encrypted at rest; non-sensitive stored as plain strings. */
function buildFieldSubdocs(fields) {
  return (fields || []).map((f, idx) => ({
    key: f.key,
    value: f.sensitive ? encryptFieldValue(String(f.value ?? '')) : String(f.value ?? ''),
    type: f.type,
    sensitive: Boolean(f.sensitive),
    order: idx,
  }));
}

async function assertFolderExists(familyId, folderId) {
  const folder = await Folder.findOne(scopeToFamily(familyId, { _id: folderId })).lean();
  if (!folder) throw new ApiError(404, 'FOLDER_NOT_FOUND', 'Folder not found');
}

async function assertMemberExists(familyId, memberId) {
  const exists = await Membership.exists(scopeToFamily(familyId, { _id: memberId }));
  if (!exists) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');
}

router.use(requireAuth, requireFamily);

/** GET /items?q=&folderId=&kind=&memberId=&tag=&page=&limit= */
router.get('/', validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const { q, folderId, kind, memberId, tag, page, limit } = req.query;

    const filter = scopeToFamily(familyId, {});
    if (folderId) filter.folderId = folderId === 'root' ? null : folderId;
    if (kind) filter.kind = kind;
    if (memberId) filter.memberId = memberId;
    if (tag) filter.tags = tag;

    let sort = { updatedAt: -1 };
    let projection = null;
    if (q) {
      filter.$text = { $search: q };
      projection = { score: { $meta: 'textScore' } };
      sort = { score: { $meta: 'textScore' } };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      VaultItem.find(filter, projection).sort(sort).skip(skip).limit(limit).lean(),
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

/** GET /items/:id */
router.get('/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const { familyId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    res.json(serializeItemDetail(item));
  } catch (err) {
    next(err);
  }
});

/** POST /items */
router.post('/', requireWrite, validate({ body: createItemSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const data = req.body;

    await assertFolderExists(familyId, data.folderId);
    if (data.memberId) await assertMemberExists(familyId, data.memberId);

    const item = await VaultItem.create({
      familyId,
      folderId: data.folderId,
      kind: data.kind,
      title: data.title,
      memberId: data.memberId || null,
      tags: data.tags,
      fields: buildFieldSubdocs(data.fields),
      createdBy: membershipId,
    });

    await logActivity(req, {
      action: 'item.create',
      targetType: 'item',
      targetId: item._id,
      folderId: item.folderId,
      meta: { title: item.title, kind: item.kind },
    });

    res.status(201).json(serializeItemDetail(item.toObject()));
  } catch (err) {
    next(err);
  }
});

/** PATCH /items/:id — `fields` (if present) REPLACES the whole array. */
router.patch('/:id', requireWrite, validate({ params: idParamSchema, body: patchItemSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id }));
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    const body = req.body;
    if (body.folderId !== undefined) {
      await assertFolderExists(familyId, body.folderId);
      item.folderId = body.folderId;
    }
    if (body.memberId !== undefined) {
      if (body.memberId) await assertMemberExists(familyId, body.memberId);
      item.memberId = body.memberId || null;
    }
    if (body.title !== undefined) item.title = body.title;
    if (body.kind !== undefined) item.kind = body.kind;
    if (body.tags !== undefined) item.tags = body.tags;

    let changedFieldKeys = null;
    if (body.fields !== undefined) {
      item.fields = buildFieldSubdocs(body.fields);
      changedFieldKeys = item.fields.map((f) => f.key);
    }

    item.updatedBy = membershipId;
    await item.save();

    await logActivity(req, {
      action: 'item.update',
      targetType: 'item',
      targetId: item._id,
      folderId: item.folderId,
      meta: { fields: Object.keys(body) },
    });
    if (changedFieldKeys) {
      await logActivity(req, {
        action: 'field.update',
        targetType: 'item',
        targetId: item._id,
        meta: { keys: changedFieldKeys },
      });
    }

    res.json(serializeItemDetail(item.toObject()));
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

/** GET /items/:id/fields/:fieldId/reveal — the ONLY route that ever returns plaintext. */
router.get('/:id/fields/:fieldId/reveal', revealLimiter, validate({ params: fieldIdParamSchema }), async (req, res, next) => {
  try {
    const { familyId, membershipId } = req.auth;
    const item = await VaultItem.findOne(scopeToFamily(familyId, { _id: req.params.id })).lean();
    if (!item) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Item not found');

    const field = (item.fields || []).find((f) => f._id.toString() === req.params.fieldId);
    if (!field) throw new ApiError(404, 'FIELD_NOT_FOUND', 'Field not found');

    if (field.sensitive) {
      const family = await Family.findById(familyId).select('settings').lean();
      if (family?.settings?.requireReauthForSecrets) {
        const header = req.headers['x-reauth'];
        let reauth;
        try {
          if (!header) throw new Error('missing');
          reauth = verifyReauthToken(header);
        } catch {
          throw new ApiError(401, 'REAUTH_REQUIRED', 'Re-authentication required');
        }
        if (reauth.membershipId !== membershipId || reauth.familyId !== familyId) {
          throw new ApiError(401, 'REAUTH_REQUIRED', 'Re-authentication required');
        }
      }
    }

    const value = field.sensitive ? (field.value ? decryptFieldValue(field.value) : '') : field.value;

    await logActivity(req, {
      action: 'field.reveal',
      targetType: 'item',
      targetId: item._id,
      meta: { key: field.key },
    });

    res.json({ value });
  } catch (err) {
    next(err);
  }
});

export default router;
