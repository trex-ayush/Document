import express from 'express';
import { z } from 'zod';

import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { User } from '../../models/User.js';
import { PlatformAdmin } from '../../models/PlatformAdmin.js';
import { superAdminEmail, isSuperAdminEmail } from '../../services/platformRoles.js';
import { logAdminAction } from './audit.js';
import { idParams } from './lib.js';

// GET/POST /admins, DELETE /admins/:id — any admin may add/remove admins. The super admin is not
// in this collection (env-configured), so it can never be removed here.
const router = express.Router();

async function buildAdminRows(admins) {
  if (!admins.length) return [];
  const [users, adders] = await Promise.all([
    User.find({ email: { $in: admins.map((a) => a.email) } }).select('name email').lean(),
    User.find({ _id: { $in: admins.map((a) => a.addedBy).filter(Boolean) } }).select('email').lean(),
  ]);
  const nameByEmail = new Map(users.map((u) => [u.email, u.name]));
  const adderById = new Map(adders.map((u) => [String(u._id), u.email]));
  return admins.map((a) => {
    const adderEmail = a.addedBy ? adderById.get(String(a.addedBy)) : null;
    return {
      id: String(a._id),
      email: a.email,
      name: nameByEmail.get(a.email) ?? null,
      addedBy: adderEmail ? { email: adderEmail } : null,
      addedAt: a.createdAt ?? null,
    };
  });
}

router.get('/', async (req, res, next) => {
  try {
    const email = superAdminEmail() || null;
    const [superUser, admins] = await Promise.all([
      email ? User.findOne({ email }).select('name').lean() : null,
      PlatformAdmin.find().sort({ createdAt: 1, _id: 1 }).select('email addedBy createdAt').lean(),
    ]);
    res.json({
      superAdmin: { email, name: superUser?.name ?? null },
      admins: await buildAdminRows(admins),
    });
  } catch (err) {
    next(err);
  }
});

const addBody = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') }).strict();

router.post('/', validate({ body: addBody }), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (isSuperAdminEmail(email)) {
      throw new ApiError(409, 'IS_SUPER_ADMIN', 'This email is already the super admin');
    }
    if (await PlatformAdmin.exists({ email })) {
      throw new ApiError(409, 'ALREADY_ADMIN', 'This email is already an admin');
    }
    let admin;
    try {
      admin = await PlatformAdmin.create({ email, addedBy: req.auth.user._id });
    } catch (err) {
      if (err?.code === 11000) throw new ApiError(409, 'ALREADY_ADMIN', 'This email is already an admin');
      throw err;
    }
    await logAdminAction(req, {
      action: 'admin.admin.add',
      targetType: 'platformAdmin',
      targetId: admin._id,
      targetTitle: email,
    });
    const [row] = await buildAdminRows([admin.toObject()]);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', validate({ params: idParams }), async (req, res, next) => {
  try {
    const admin = await PlatformAdmin.findByIdAndDelete(req.params.id).lean();
    if (!admin) throw new ApiError(404, 'NOT_FOUND', 'Admin not found');
    await logAdminAction(req, {
      action: 'admin.admin.remove',
      targetType: 'platformAdmin',
      targetId: admin._id,
      targetTitle: admin.email,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
