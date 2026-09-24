import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Input from '@/components/ui/Input.jsx';
import Button from '@/components/ui/Button.jsx';
import { familyApi } from '@/services/familyApi.js';

// `Family.storageDriver` mirrors the server's `STORAGE_DRIVER` env enum
// (`gridfs`|`s3`|`local` — server/src/config/env.js). Display-only labels.
const STORAGE_DRIVER_LABELS = {
  gridfs: 'MongoDB (default)',
  s3: 'S3',
  local: 'Local disk (dev only)',
};

// Bounds + env defaults per the build spec / server/.env.example. Each setting is
// "unset = use this deployment's env default" (Family.settings.* stores `null` for
// unset — see server/src/models/Family.js and utils/effectiveSettings.js).
const LIMITS = {
  maxFileMB: { min: 1, max: 200, default: 20, label: 'Max file size (MB)' },
  activityRetentionDays: { min: 30, max: 3650, default: 365, label: 'Activity log retention (days)' },
  storageLimitMB: { min: 100, max: null, default: 512, label: 'Storage warning threshold (MB)' },
};

/** A possibly-null stored setting -> the string an <Input> should show ('' = unset). */
function toFieldValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Settings > System tab — admin only (gated by the parent `Settings.jsx`, same as
 * Family/Document types/Notifications). Operational limits stored per-family on
 * `Family.settings` (`maxFileMB`/`activityRetentionDays`/`storageLimitMB`), each
 * saved via `PATCH /family` exactly like `SettingsFamily.jsx` does. A blank field
 * sends `null`, which clears the family-level override back to the server's env
 * default; the server always sends the raw stored value (possibly `null`), never a
 * resolved "effective" number, so an unset field shows as blank + a default hint
 * rather than a filled-in value that looks like an explicit choice.
 *
 * `storageDriver` (from `GET /family`) is read-only — switching storage backends
 * needs env vars + a redeploy, not something this form can do.
 */
export default function SettingsSystem({ family }) {
  const queryClient = useQueryClient();
  const [maxFileMB, setMaxFileMB] = useState('');
  const [activityRetentionDays, setActivityRetentionDays] = useState('');
  const [storageLimitMB, setStorageLimitMB] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!family) return;
    setMaxFileMB(toFieldValue(family.settings?.maxFileMB));
    setActivityRetentionDays(toFieldValue(family.settings?.activityRetentionDays));
    setStorageLimitMB(toFieldValue(family.settings?.storageLimitMB));
  }, [family]);

  // '' -> null (unset/clear). Otherwise a finite number within bounds, or `undefined` to
  // signal "invalid, block the save" (max may be null = no upper bound).
  const parseField = (raw, key) => {
    if (raw === '' || raw === null || raw === undefined) return null;
    const num = Number(raw);
    const { min, max } = LIMITS[key];
    if (!Number.isFinite(num) || num < min || (max != null && num > max)) return undefined;
    return num;
  };

  const handleSave = async () => {
    const nextMaxFileMB = parseField(maxFileMB, 'maxFileMB');
    const nextRetention = parseField(activityRetentionDays, 'activityRetentionDays');
    const nextStorageLimit = parseField(storageLimitMB, 'storageLimitMB');

    if (nextMaxFileMB === undefined) {
      toast.error(`Max file size must be between ${LIMITS.maxFileMB.min} and ${LIMITS.maxFileMB.max} MB, or blank.`);
      return;
    }
    if (nextRetention === undefined) {
      toast.error(
        `Activity log retention must be between ${LIMITS.activityRetentionDays.min} and ${LIMITS.activityRetentionDays.max} days, or blank.`,
      );
      return;
    }
    if (nextStorageLimit === undefined) {
      toast.error(`Storage warning threshold must be ${LIMITS.storageLimitMB.min} MB or more, or blank.`);
      return;
    }

    setSaving(true);
    try {
      await familyApi.update({
        settings: {
          maxFileMB: nextMaxFileMB,
          activityRetentionDays: nextRetention,
          storageLimitMB: nextStorageLimit,
        },
      });
      toast.success('System settings saved');
      queryClient.invalidateQueries({ queryKey: ['family'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save system settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!family) return null;

  const driverLabel = STORAGE_DRIVER_LABELS[family.storageDriver] || family.storageDriver || 'Unknown';

  return (
    <Card>
      <CardBody className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Operational limits for this family. Leave a field blank to fall back to this deployment&apos;s default.
        </p>

        <Input
          label={LIMITS.maxFileMB.label}
          type="number"
          min={LIMITS.maxFileMB.min}
          max={LIMITS.maxFileMB.max}
          value={maxFileMB}
          onChange={(e) => setMaxFileMB(e.target.value)}
          placeholder={`Using default: ${LIMITS.maxFileMB.default} MB`}
          help={`Largest file allowed per upload (${LIMITS.maxFileMB.min}–${LIMITS.maxFileMB.max} MB).`}
        />

        <Input
          label={LIMITS.activityRetentionDays.label}
          type="number"
          min={LIMITS.activityRetentionDays.min}
          max={LIMITS.activityRetentionDays.max}
          value={activityRetentionDays}
          onChange={(e) => setActivityRetentionDays(e.target.value)}
          placeholder={`Using default: ${LIMITS.activityRetentionDays.default} days`}
          help={`Activity older than this is automatically pruned (${LIMITS.activityRetentionDays.min}–${LIMITS.activityRetentionDays.max} days).`}
        />

        <Input
          label={LIMITS.storageLimitMB.label}
          type="number"
          min={LIMITS.storageLimitMB.min}
          value={storageLimitMB}
          onChange={(e) => setStorageLimitMB(e.target.value)}
          placeholder={`Using default: ${LIMITS.storageLimitMB.default} MB`}
          help={`Storage used past this amount triggers the 80%/95% admin-alert emails (${LIMITS.storageLimitMB.min} MB minimum).`}
        />

        <div>
          <p className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Storage driver</p>
          <p className="text-sm text-neutral-900 dark:text-neutral-100">Storage: {driverLabel}</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Switching storage drivers requires environment variables and a redeploy — not editable here.
          </p>
        </div>

        <Button onClick={handleSave} loading={saving}>
          Save
        </Button>
      </CardBody>
    </Card>
  );
}
