import express from 'express';

import { requireAuth, requireAdmin, scopeToFamily } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { logActivity } from '../../services/activityLogger.js';
import { DocumentType } from '../../models/DocumentType.js';
import { createDocumentTypeSchema, patchDocumentTypeSchema } from './schemas.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const items = await DocumentType.find(scopeToFamily(req.auth.familyId)).sort({ name: 1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, validate({ body: createDocumentTypeSchema }), async (req, res, next) => {
  try {
    const docType = await DocumentType.create({ ...req.body, familyId: req.auth.familyId });
    await logActivity(req, { action: 'document_type.create', targetType: 'documentType', targetId: docType._id });
    res.status(201).json(docType);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireAdmin, validate({ body: patchDocumentTypeSchema }), async (req, res, next) => {
  try {
    const docType = await DocumentType.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!docType) throw new ApiError(404, 'NOT_FOUND', 'Document type not found');

    Object.assign(docType, req.body);
    await docType.save();

    await logActivity(req, {
      action: 'document_type.update',
      targetType: 'documentType',
      targetId: docType._id,
      meta: { changedKeys: Object.keys(req.body) },
    });

    res.json(docType);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const docType = await DocumentType.findOne(scopeToFamily(req.auth.familyId, { _id: req.params.id }));
    if (!docType) throw new ApiError(404, 'NOT_FOUND', 'Document type not found');

    await docType.deleteOne();

    await logActivity(req, {
      action: 'document_type.delete',
      targetType: 'documentType',
      targetId: req.params.id,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
