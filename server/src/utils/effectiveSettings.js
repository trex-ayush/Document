import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Family } from '../models/Family.js';
import { PlatformSettings } from '../models/PlatformSettings.js';

/**
 * Resolve a family's operational settings, falling back to the env var default whenever a
 * setting is `null`/unset on the Family document. Centralizes the `?? env.X` pattern so every
 * consumer (upload size check, storage-alert threshold, login-method policy) agrees on the same
 * fallback rule. Accepts either a full Family doc/lean-object or just its `settings` subobject.
 *
 * `activityRetentionDays` is the one exception: it has a THIRD tier (a deployment-wide platform
 * default, see PlatformSettings.activityRetentionDays) between the family override and the env
 * fallback, which needs an async DB read — so this sync function deliberately leaves it `null`
 * when the family hasn't overridden it, rather than jumping straight to `env.X` here. Only
 * `getEffectiveFamilySettings()` below does the full 3-tier resolution; direct callers of this
 * function that don't read `activityRetentionDays` (e.g. services/alerts.js) are unaffected.
 */
export function resolveFamilySettings(familyOrSettings) {
  const settings = familyOrSettings?.settings || familyOrSettings || {};
  return {
    activityRetentionDays: settings.activityRetentionDays ?? null,
    maxFileMB: settings.maxFileMB ?? env.MAX_FILE_MB,
    storageLimitMB: settings.storageLimitMB ?? env.STORAGE_LIMIT_MB,
    requireReauthForSecrets: settings.requireReauthForSecrets ?? true,
  };
}

/**
 * The platform-wide default for activityRetentionDays (middle tier of the 3-tier resolution —
 * see resolveFamilySettings's doc comment). Never throws, same defensive shape as
 * services/mailer.js#loadPlatformSmtp(): a `readyState` check avoids Mongoose's connect-buffering
 * timeout when no DB is connected (e.g. a unit test exercising this module in isolation), and any
 * other failure just falls through to the env default instead of surfacing an error.
 */
async function getPlatformActivityRetentionDays() {
  if (mongoose.connection.readyState !== 1) return env.ACTIVITY_RETENTION_DAYS;
  try {
    const settings = await PlatformSettings.findById('platform').select('activityRetentionDays').lean();
    return settings?.activityRetentionDays ?? env.ACTIVITY_RETENTION_DAYS;
  } catch {
    return env.ACTIVITY_RETENTION_DAYS;
  }
}

/**
 * Look up a family by id and resolve its effective settings in one call. Never throws — a lookup
 * failure (bad id, transient DB issue) resolves to pure env defaults rather than blocking whatever
 * feature called it (file upload, activity logging, storage alerts all treat "can't reach
 * settings" as "use the default", not as an error to surface to the user).
 *
 * Resolution order for activityRetentionDays specifically: family override -> platform admin
 * default -> env.ACTIVITY_RETENTION_DAYS (see docs/DECISIONS.md "Operational settings").
 */
export async function getEffectiveFamilySettings(familyId) {
  let resolved;
  try {
    const family = await Family.findById(familyId).select('settings').lean();
    resolved = resolveFamilySettings(family);
  } catch {
    resolved = resolveFamilySettings(null);
  }
  if (resolved.activityRetentionDays == null) {
    resolved.activityRetentionDays = await getPlatformActivityRetentionDays();
  }
  return resolved;
}
