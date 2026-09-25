import express from 'express';
import mongoose from 'mongoose';

import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { requirePlatformAdmin } from '../../services/platformRoles.js';
import { User } from '../../models/User.js';
import { Family } from '../../models/Family.js';
import { Membership } from '../../models/Membership.js';
import { Document } from '../../models/Document.js';
import { VaultItem } from '../../models/VaultItem.js';
import { Folder } from '../../models/Folder.js';
import { Share } from '../../models/Share.js';
import { Activity } from '../../models/Activity.js';
import { PlatformSettings, getPlatformSettings } from '../../models/PlatformSettings.js';
import { buildActivityRows } from './lib.js';
import usersRouter from './users.js';
import familiesRouter from './families.js';
import opsRouter from './ops.js';
import adminsRouter from './admins.js';

// Admin panel API — the contract is docs/ADMIN_API.md. Every route needs a logged-in super admin
// or admin (403 NOT_PLATFORM_ADMIN otherwise). Responses are METADATA ONLY (see lib.js).
const router = express.Router();
router.use(requireAuth, requirePlatformAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/me', (req, res) => {
  res.json({
    email: req.auth.user.email,
    role: req.platformRole,
    isSuperAdmin: req.platformRole === 'super',
  });
});

router.get('/overview', async (req, res, next) => {
  try {
    const now = Date.now();
    const d7 = new Date(now - 7 * DAY_MS);
    const d30 = new Date(now - 30 * DAY_MS);

    const [
      users,
      activeUsers30d,
      disabledUsers,
      families,
      members,
      invitesPending,
      documents,
      fileAgg,
      passwords,
      notes,
      folders,
      sharesActive,
      sharesTotal,
      storageAgg,
      topFamilies,
      last7d,
      last30d,
      recent,
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ lastLoginAt: { $gte: d30 } }),
      User.countDocuments({ disabled: true }),
      Family.countDocuments({}),
      Membership.countDocuments({ status: { $ne: 'invited' } }),
      Membership.countDocuments({ status: 'invited' }),
      Document.countDocuments({}),
      Document.aggregate([
        { $match: { deletedAt: null } },
        { $group: { _id: null, n: { $sum: { $size: { $ifNull: ['$files', []] } } } } },
      ]),
      VaultItem.countDocuments({ kind: 'login' }),
      VaultItem.countDocuments({ kind: 'note' }),
      Folder.countDocuments({}),
      Share.countDocuments({ revokedAt: null, expiresAt: { $gt: new Date(now) } }),
      Share.countDocuments({}),
      Family.aggregate([{ $group: { _id: null, n: { $sum: { $ifNull: ['$storageBytes', 0] } } } }]),
      Family.find({}).sort({ storageBytes: -1, _id: 1 }).limit(5).select('name storageBytes').lean(),
      User.countDocuments({ createdAt: { $gte: d7 } }),
      User.countDocuments({ createdAt: { $gte: d30 } }),
      Activity.find({})
        .sort({ createdAt: -1, _id: -1 })
        .limit(10)
        .select('familyId actorMembershipId actorName action targetType meta createdAt')
        .lean(),
    ]);

    res.json({
      counts: {
        users,
        activeUsers30d,
        disabledUsers,
        families,
        members,
        invitesPending,
        documents,
        files: fileAgg[0]?.n || 0,
        passwords,
        notes,
        folders,
        sharesActive,
        sharesTotal,
      },
      storage: {
        totalBytes: storageAgg[0]?.n || 0,
        topFamilies: topFamilies.map((f) => ({ id: String(f._id), name: f.name, bytes: f.storageBytes || 0 })),
      },
      signups: { last7d, last30d },
      recentActivity: await buildActivityRows(recent),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/system', async (req, res, next) => {
  try {
    const { db } = mongoose.connection;
    const [stats, collections, settings, smtpRow] = await Promise.all([
      db.stats(),
      db.listCollections({}, { nameOnly: true }).toArray(),
      getPlatformSettings(),
      // Only the host — the SMTP password is never read here.
      PlatformSettings.findById('platform').select('smtp.host').lean(),
    ]);
    const counts = await Promise.all(collections.map((c) => db.collection(c.name).estimatedDocumentCount()));
    const smtpHost = smtpRow?.smtp?.host || env.SMTP_HOST || null;
    const mem = process.memoryUsage();

    res.json({
      app: {
        commit: process.env.RENDER_GIT_COMMIT || null,
        nodeVersion: process.version,
        uptimeSec: Math.round(process.uptime()),
        nodeEnv: env.NODE_ENV,
      },
      config: {
        storageDriver: env.STORAGE_DRIVER,
        emailEnabled: Boolean(smtpHost),
        smtpHost,
        allowedLoginMethods: settings.allowedLoginMethods,
      },
      db: {
        dataSizeBytes: stats.dataSize ?? 0,
        storageSizeBytes: stats.storageSize ?? 0,
        indexSizeBytes: stats.indexSize ?? 0,
        collections: Object.fromEntries(
          collections.map((c, i) => [c.name, counts[i]]).sort((a, b) => a[0].localeCompare(b[0])),
        ),
      },
      memory: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
    });
  } catch (err) {
    next(err);
  }
});

router.use('/users', usersRouter);
router.use('/families', familiesRouter);
router.use('/admins', adminsRouter);
router.use('/', opsRouter);

export default router;
