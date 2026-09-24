import { env } from '../config/env.js';
import { Family } from '../models/Family.js';

/**
 * Resolve a family's operational settings, falling back to the env var default whenever a
 * setting is `null`/unset on the Family document. Centralizes the `?? env.X` pattern so every
 * consumer (upload size check, activity retention, storage-alert threshold, login-method policy)
 * agrees on the same fallback rule. Accepts either a full Family doc/lean-object or just its
 * `settings` subobject.
 */
export function resolveFamilySettings(familyOrSettings) {
  const settings = familyOrSettings?.settings || familyOrSettings || {};
  return {
    activityRetentionDays: settings.activityRetentionDays ?? env.ACTIVITY_RETENTION_DAYS,
    maxFileMB: settings.maxFileMB ?? env.MAX_FILE_MB,
    storageLimitMB: settings.storageLimitMB ?? env.STORAGE_LIMIT_MB,
    requireReauthForSecrets: settings.requireReauthForSecrets ?? true,
  };
}

/**
 * Look up a family by id and resolve its effective settings in one call. Never throws — a lookup
 * failure (bad id, transient DB issue) resolves to pure env defaults rather than blocking whatever
 * feature called it (file upload, activity logging, storage alerts all treat "can't reach
 * settings" as "use the default", not as an error to surface to the user).
 */
export async function getEffectiveFamilySettings(familyId) {
  try {
    const family = await Family.findById(familyId).select('settings').lean();
    return resolveFamilySettings(family);
  } catch {
    return resolveFamilySettings(null);
  }
}
