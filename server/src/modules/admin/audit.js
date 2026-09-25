import { Activity } from '../../models/Activity.js';
import { hashIp } from '../../utils/crypto.js';
import { getEffectivePlatformLimits } from '../../utils/effectiveSettings.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Writes one `admin.*` row to the activity log (docs/ADMIN_API.md). Not via logActivity(): these
 * rows usually belong to no family (familyId null — see models/Activity.js) and must not trigger
 * family alert emails. The acting admin is `meta.actorUserId`; `meta.targetTitle` is a plain label
 * (an email or a share's target title) — never anything secret. A logging failure never undoes
 * or fails the mutation that already happened.
 */
export async function logAdminAction(req, { action, targetType = null, targetId = null, familyId = null, shareId = null, targetTitle = null }) {
  try {
    const { activityRetentionDays } = await getEffectivePlatformLimits();
    const ip = req.ip || req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || null;
    await Activity.create({
      familyId,
      actorMembershipId: null,
      actorName: 'Platform admin',
      action,
      targetType,
      targetId,
      shareId,
      meta: { actorUserId: req.auth.user._id, targetTitle },
      ipHash: hashIp(ip),
      userAgent: (req.headers?.['user-agent'] || '').slice(0, 300),
      expiresAt: new Date(Date.now() + activityRetentionDays * DAY_MS),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[admin] failed to log "${action}":`, err?.message || err);
  }
}
