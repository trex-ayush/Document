import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import PasswordInput from '@/components/ui/PasswordInput.jsx';
import ChoiceGroup from '@/components/ui/ChoiceGroup.jsx';
import Badge from '@/components/ui/Badge.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { InlineError, LoadingState, Notice } from '@/components/ui/PageState.jsx';
import { ListCard } from '@/components/ui/ListRow.jsx';
import { ITEM_ICON, KIND_ICON, SECTION_GAP } from '@/components/ui/tokens.js';
import { Section } from './adminShared.jsx';
import { formatRelativeTime } from '@/i18n/formatters.js';
import { platformApi } from '@/services/platformApi.js';
import { mergePlatformSettings, platformSettingsQuery } from '@/hooks/usePlatformOwner.js';
import { Link } from 'react-router-dom';
import { File, FileText, Folder, House, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';

// Labels come from the `platform` namespace (t(`signIn.options.${value}`)) at render time.
const OPTIONS = ['google', 'password', 'both'];

// `secure` (TLS/SSL) is a 3-state field (`null` = "use this deployment's default", same as every
// other smtp.* field) — a plain on/off toggle can't represent "unset" without lying, so it gets
// the same small button-group treatment as the sign-in-method picker above, not a Switch.
const SECURE_OPTIONS = [
  { value: null, labelKey: 'smtp.secure.default', fallback: 'Use default' },
  { value: true, labelKey: 'smtp.secure.on', fallback: 'On' },
  { value: false, labelKey: 'smtp.secure.off', fallback: 'Off' },
];

// Bin entry kinds: icon + colour (KIND_ICON). `file` = one file deleted from a document that still exists.
const BIN_KIND = {
  document: { icon: FileText, kind: 'document' },
  folder: { icon: Folder, kind: 'folder' },
  item: { icon: KeyRound, kind: 'password' },
  file: { icon: File, kind: 'document' },
};
const BIN_TYPE_FALLBACK = { document: 'Document', folder: 'Folder', item: 'Vault item', file: 'File' };

// `storageDriver` (owner-only on GET /platform-settings) mirrors the server's STORAGE_DRIVER env
// enum. Read-only: switching drivers needs env vars + a redeploy.
const STORAGE_DRIVERS = ['gridfs', 's3', 'local'];

// Same bounds the server enforces (PATCH /platform-settings). `max: null` = no upper bound.
const LIMIT_BOUNDS = {
  maxFileMB: { min: 1, max: 200 },
  storageLimitMB: { min: 100, max: null },
};

/** A possibly-null stored value -> the string an <Input> should show ('' = unset). */
function toFieldValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

// One-click starting points for the SMTP form. Gmail is here only because people expect it — it
// does not work on Render's free plan (outbound SMTP ports are blocked there).
const SMTP_PRESETS = [
  { key: 'brevo', label: 'Brevo', host: 'smtp-relay.brevo.com', port: '2525', secure: false },
  { key: 'gmail', label: 'Gmail', host: 'smtp.gmail.com', port: '465', secure: true },
];

const emptySmtpForm = { host: '', port: '', secure: null, user: '', mailFrom: '', replyTo: '', pass: '' };

/**
 * Admin > Settings (`/admin/settings`) — the deployment-wide Platform Settings (sign-in methods,
 * limits, email/SMTP, bin), NOT per-family (docs/API.md "Platform settings"). This is the one
 * home of that page; the old `/platform-settings` route redirects here. Strings stay in the
 * `platform` namespace; only the admin read-only note is `adminOps`.
 *
 * Who can change what (docs/ADMIN_API.md): only the super admin (`isPlatformOwner`). An admin who
 * is not the super admin (`isPlatformOwner === false` and `isPlatformAdmin === true`) sees every
 * section read-only with a note; anyone else gets the "only the owner" screen.
 *
 * Access gating: `GET /platform-settings` is public and — for an anonymous caller — there's no
 * client-visible field that says who the platform owner is (server-side-only by design, keyed
 * off env `PLATFORM_OWNER_EMAIL`), so this page can't hide itself from a route-guard
 * perspective — it renders for anyone who reaches it. It opens read-only (sign-in methods) /
 * always-editable-but-harmless (email settings) with the real enforcement being
 * `PATCH /platform-settings` 403ing server-side for anyone but the owner, which both sections
 * below catch specifically and turn into a friendly inline message instead of a raw error toast,
 * rather than trying to guess ownership client-side.
 *
 * (`GET /platform-settings` DOES include `isPlatformOwner` for a logged-in caller — that's used
 * elsewhere, to decide whether to show a nav link to this page at all; this page itself keeps the
 * original "try the write, handle a 403" approach since a nav link can already keep most
 * non-owners from ever landing here.)
 */
export default function AdminSettings() {
  const { t } = useTranslation(['platform', 'common', 'adminOps']);
  const queryClient = useQueryClient();
  const signInLabel = (value) =>
    t(`signIn.options.${value}`, { google: 'Google only', password: 'Password only', both: 'Both' }[value] || value);
  const forbiddenText = t('forbidden', "You don't have permission to change this. Only the configured platform owner can update deployment-wide settings.");
  const serverDefault = t('useServerDefault', "Using this server's default");
  // "Using default: 20 MB" when the server told us the env fallback (owner-only `defaults`),
  // otherwise the generic hint.
  const defaultHint = (key, unitKey, unitFallback) => {
    const value = data?.defaults?.[key];
    if (value === undefined || value === null) return serverDefault;
    return t('usingDefault', 'Using default: {{value}}', { value: t(unitKey, unitFallback, { count: value }) });
  };
  const { data, isLoading, isError } = useQuery(platformSettingsQuery());
  // Known-and-false only: while loading (or if the server omits the flag) the page behaves as before.
  // A platform admin who isn't the super admin sees everything read-only; anyone else is turned away.
  const readOnly = data?.isPlatformOwner === false;
  const isAdminViewer = data?.isPlatformAdmin === true || data?.platformRole === 'admin';
  const notOwner = readOnly && !isAdminViewer;

  // ---------- Sign-in methods (unchanged) ----------
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const current = data?.allowedLoginMethods;

  const startEditing = () => {
    setSelected(current || 'both');
    setForbidden(false);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForbidden(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setForbidden(false);
    try {
      const updated = await platformApi.update({ allowedLoginMethods: selected });
      mergePlatformSettings(queryClient, updated);
      toast.success(t('signIn.saved', 'Platform sign-in policy saved'));
      setEditing(false);
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || t('signIn.saveFailed', 'Could not save the platform sign-in policy.'));
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Activity log retention (deployment-wide, platform admin only) ----------
  const [retentionField, setRetentionField] = useState('');
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionForbidden, setRetentionForbidden] = useState(false);

  useEffect(() => {
    setRetentionField(toFieldValue(data?.activityRetentionDays));
  }, [data?.activityRetentionDays]);

  const handleRetentionSave = async () => {
    let activityRetentionDays = null;
    if (retentionField.trim() !== '') {
      const num = Number(retentionField);
      if (!Number.isInteger(num) || num < 30 || num > 3650) {
        toast.error(t('retention.invalid', "Activity log retention must be between 30 and 3650 days, or blank to use this server's default."));
        return;
      }
      activityRetentionDays = num;
    }

    setRetentionSaving(true);
    setRetentionForbidden(false);
    try {
      const updated = await platformApi.update({ activityRetentionDays });
      mergePlatformSettings(queryClient, updated);
      toast.success(t('retention.saved', 'Activity log retention saved'));
    } catch (err) {
      if (err?.response?.status === 403) {
        setRetentionForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || t('retention.saveFailed', 'Could not save the activity log retention.'));
      }
    } finally {
      setRetentionSaving(false);
    }
  };

  // ---------- Upload & storage limits (deployment-wide, platform admin only) ----------
  const [limitsForm, setLimitsForm] = useState({ maxFileMB: '', storageLimitMB: '' });
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [limitsForbidden, setLimitsForbidden] = useState(false);

  useEffect(() => {
    setLimitsForm({ maxFileMB: toFieldValue(data?.maxFileMB), storageLimitMB: toFieldValue(data?.storageLimitMB) });
  }, [data?.maxFileMB, data?.storageLimitMB]);

  // '' -> null (clear, fall back to env). Otherwise a whole number within bounds, or `undefined`
  // to signal "invalid, block the save".
  const parseLimit = (raw, key) => {
    if (String(raw).trim() === '') return null;
    const num = Number(raw);
    const { min, max } = LIMIT_BOUNDS[key];
    if (!Number.isInteger(num) || num < min || (max !== null && num > max)) return undefined;
    return num;
  };

  const handleLimitsSave = async () => {
    const maxFileMB = parseLimit(limitsForm.maxFileMB, 'maxFileMB');
    const storageLimitMB = parseLimit(limitsForm.storageLimitMB, 'storageLimitMB');
    if (maxFileMB === undefined) {
      toast.error(t('limits.maxFileInvalid', 'Max file size must be a whole number from 1 to 200 MB, or blank to use the default.'));
      return;
    }
    if (storageLimitMB === undefined) {
      toast.error(t('limits.storageInvalid', 'Storage warning threshold must be a whole number of at least 100 MB, or blank to use the default.'));
      return;
    }

    setLimitsSaving(true);
    setLimitsForbidden(false);
    try {
      const updated = await platformApi.update({ maxFileMB, storageLimitMB });
      mergePlatformSettings(queryClient, updated);
      toast.success(t('limits.saved', 'Upload and storage limits saved'));
    } catch (err) {
      if (err?.response?.status === 403) {
        setLimitsForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || t('limits.saveFailed', 'Could not save the upload and storage limits.'));
      }
    } finally {
      setLimitsSaving(false);
    }
  };

  const driverLabel = (driver) =>
    STORAGE_DRIVERS.includes(driver)
      ? t(`limits.drivers.${driver}`, { gridfs: 'MongoDB (default)', s3: 'S3', local: 'Local disk (dev only)' }[driver])
      : driver || t('limits.driverUnknown', 'Unknown');

  // ---------- Bin retention (informational only — never auto-purges anything) ----------
  const [binRetentionField, setBinRetentionField] = useState('');
  const [binRetentionSaving, setBinRetentionSaving] = useState(false);
  const [binRetentionForbidden, setBinRetentionForbidden] = useState(false);

  useEffect(() => {
    setBinRetentionField(toFieldValue(data?.binRetentionDays));
  }, [data?.binRetentionDays]);

  const handleBinRetentionSave = async () => {
    let binRetentionDays = null;
    if (binRetentionField.trim() !== '') {
      const num = Number(binRetentionField);
      if (!Number.isInteger(num) || num < 30 || num > 3650) {
        toast.error(t('binRetention.invalid', 'Bin retention guidance must be between 30 and 3650 days, or blank.'));
        return;
      }
      binRetentionDays = num;
    }

    setBinRetentionSaving(true);
    setBinRetentionForbidden(false);
    try {
      const updated = await platformApi.update({ binRetentionDays });
      mergePlatformSettings(queryClient, updated);
      toast.success(t('binRetention.saved', 'Bin retention guidance saved'));
    } catch (err) {
      if (err?.response?.status === 403) {
        setBinRetentionForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || t('binRetention.saveFailed', 'Could not save the bin retention guidance.'));
      }
    } finally {
      setBinRetentionSaving(false);
    }
  };

  // ---------- Bin (permanent delete — every family, platform owner only) ----------
  const { data: binData, isLoading: binLoading, isError: binIsError } = useQuery({
    queryKey: ['platform-bin'],
    queryFn: () => platformApi.listBin(),
    // Owner-only endpoint — don't fire a request that can only 403 for everyone else.
    enabled: data?.isPlatformOwner === true,
  });
  const binItems = binData?.items || [];
  const [selectedBinIds, setSelectedBinIds] = useState(new Set());
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [binForbidden, setBinForbidden] = useState(false);
  // Why each entry that couldn't be removed wasn't (from the purge results), shown under its row.
  const [purgeErrors, setPurgeErrors] = useState({});
  const [binError, setBinError] = useState('');

  const toggleBinSelection = (key) => {
    setSelectedBinIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePurgeSelected = async () => {
    const items = binItems
      .filter((entry) => selectedBinIds.has(`${entry.type}:${entry.id}`))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    if (!items.length) return;

    setConfirmingPurge(false);
    setBinForbidden(false);
    setBinError('');
    setPurgeErrors({});
    try {
      const { results } = await platformApi.purgeBin(items);
      const failed = results.filter((r) => !r.purged);
      setPurgeErrors(
        Object.fromEntries(
          failed.map((r) => [`${r.type}:${r.id}`, r.error || t('bin.itemFailed', 'Could not be removed. Please try again.')]),
        ),
      );
      if (failed.length) {
        toast.error(
          t('bin.partiallyPurged', '{{done}} of {{total}} removed permanently — {{failed}} could not be removed.', {
            done: results.length - failed.length,
            total: results.length,
            failed: failed.length,
          }),
        );
      } else {
        toast.success(t('bin.purged', '{{count}} items permanently removed', { count: results.length }));
      }
      // Keep the entries that failed selected, so trying again is one tap.
      setSelectedBinIds(new Set(failed.map((r) => `${r.type}:${r.id}`)));
      queryClient.invalidateQueries({ queryKey: ['platform-bin'] });
    } catch (err) {
      if (err?.response?.status === 403) {
        setBinForbidden(true);
      } else {
        const message = err?.response?.data?.message || t('bin.purgeFailed', 'Could not permanently remove the selected items.');
        setBinError(message);
        toast.error(message);
      }
    }
  };

  // ---------- Email (SMTP) ----------
  const [smtpForm, setSmtpForm] = useState(emptySmtpForm);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpForbidden, setSmtpForbidden] = useState(false);

  // Populate the form from the loaded settings. `pass` always starts blank — the server never
  // sends back the stored password (not even masked), so there's nothing to pre-fill; a blank
  // field simply means "don't change it" (see handleSmtpSave below).
  useEffect(() => {
    if (!data?.smtp) return;
    setSmtpForm({
      host: toFieldValue(data.smtp.host),
      port: toFieldValue(data.smtp.port),
      secure: data.smtp.secure ?? null,
      user: toFieldValue(data.smtp.user),
      mailFrom: toFieldValue(data.smtp.mailFrom),
      replyTo: toFieldValue(data.smtp.replyTo),
      pass: '',
    });
  }, [data?.smtp]);

  const hasPassword = Boolean(data?.smtp?.hasPassword);

  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const applyPreset = (preset) => {
    setSmtpForm((f) => ({ ...f, host: preset.host, port: preset.port, secure: preset.secure }));
  };

  const handleTestEmail = async () => {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await platformApi.testEmail();
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, hint: err?.response?.data?.message || t('smtp.testFailed', 'Could not send the test email.') });
    } finally {
      setTestSending(false);
    }
  };

  const updateSmtpField = (key) => (e) => {
    setSmtpForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleSmtpSave = async () => {
    // '' -> null (clear, fall back to the env default). Port additionally needs to parse as a
    // positive whole number when set.
    const host = smtpForm.host.trim() === '' ? null : smtpForm.host.trim();
    const user = smtpForm.user.trim() === '' ? null : smtpForm.user.trim();
    const mailFrom = smtpForm.mailFrom.trim() === '' ? null : smtpForm.mailFrom.trim();
    const replyTo = smtpForm.replyTo.trim() === '' ? null : smtpForm.replyTo.trim();

    let port = null;
    if (smtpForm.port.toString().trim() !== '') {
      const num = Number(smtpForm.port);
      if (!Number.isInteger(num) || num <= 0) {
        toast.error(t('smtp.portInvalid', 'The SMTP port must be a positive whole number, or blank to use the default.'));
        return;
      }
      port = num;
    }

    const payload = {
      smtp: {
        host,
        port,
        secure: smtpForm.secure,
        user,
        mailFrom,
        replyTo,
      },
    };
    // Only send a password when the admin actually typed a new one — an empty field always means
    // "leave the stored password alone", never "clear it" (there's no UI for that here by design;
    // it's rare enough to not be worth a second control).
    if (smtpForm.pass.trim() !== '') {
      payload.smtp.pass = smtpForm.pass;
    }

    setSmtpSaving(true);
    setSmtpForbidden(false);
    try {
      const updated = await platformApi.update(payload);
      mergePlatformSettings(queryClient, updated);
      setSmtpForm((f) => ({ ...f, pass: '' }));
      toast.success(t('smtp.saved', 'Email settings saved'));
    } catch (err) {
      if (err?.response?.status === 403) {
        setSmtpForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || t('smtp.saveFailed', 'Could not save the email settings.'));
      }
    } finally {
      setSmtpSaving(false);
    }
  };

  if (notOwner) {
    return (
      <div className="max-w-2xl">
        <EmptyState
          icon={<ShieldCheck className="w-14 h-14" strokeWidth={1.5} />}
          title={t('notOwner.title', 'Only the platform owner can open this page')}
          description={t('notOwner.description', 'This page changes settings for everyone using this app. Ask the person who set it up if something here needs changing.')}
          action={
            <Button as={Link} to="/" leftIcon={<House className="w-4 h-4" />}>
              {t('notOwner.action', 'Go home')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className={SECTION_GAP}>
      {/* The admin layout already shows the "Admin" title and section chips. */}
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t('subtitle', 'Deployment-wide settings — apply to every family on this instance, not just one.')}
      </p>

      {readOnly && (
        <Notice tone="info">
          {t('adminOps:settings.readOnly', 'Only the super admin can change these settings. You can see them, but not edit them.')}
        </Notice>
      )}

      <Section title={t('signIn.title', 'Sign-in methods')} bodyClassName="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState compact />
          ) : isError ? (
            <InlineError>{t('loadError', 'Could not load platform settings.')}</InlineError>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  {t('signIn.allowedLabel', 'Allowed sign-in methods')}
                </p>

                {!editing ? (
                  <div className="flex items-center gap-3">
                    <Badge tone="blue">{signInLabel(current)}</Badge>
                    {!readOnly && (
                      <Button variant="secondary" size="sm" onClick={startEditing}>
                        {t('actions.edit', 'Edit')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ChoiceGroup
                      columns={3}
                      value={selected}
                      onChange={setSelected}
                      options={OPTIONS.map((opt) => ({ value: opt, label: signInLabel(opt) }))}
                    />

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                      <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
                        {t('actions.cancel', 'Cancel')}
                      </Button>
                      <Button onClick={handleSave} loading={saving}>
                        {t('actions.save', 'Save')}
                      </Button>
                    </div>

                    {forbidden && <InlineError>{forbiddenText}</InlineError>}
                  </div>
                )}
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('signIn.help', "Controls whether sign-in and sign-up across the whole deployment can use Google, password, or either — separate from any one member's own sign-in method (set per-member on the Members page).")}
              </p>
            </>
          )}
      </Section>

      <Section title={t('retention.title', 'Activity log retention')} bodyClassName="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState compact />
          ) : isError ? (
            <InlineError>{t('loadError', 'Could not load platform settings.')}</InlineError>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('retention.description', "How many days activity history is kept, for every family on this deployment. Leave blank to fall back to this server's own configuration.")}
              </p>

              <Input
                label={t('retention.label', 'Retention (days)')}
                type="number"
                inputMode="numeric"
                min={30}
                max={3650}
                value={retentionField}
                onChange={(e) => setRetentionField(e.target.value)}
                disabled={readOnly}
                placeholder={defaultHint('activityRetentionDays', 'units.days', '{{count}} days')}
                help={t('retention.help', '30–3650 days. Applies to every family — families cannot change it.')}
              />

              {!readOnly && (
                <div className="kb-sticky flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                  <Button onClick={handleRetentionSave} loading={retentionSaving}>
                    {t('retention.save', 'Save retention')}
                  </Button>
                </div>
              )}

              {retentionForbidden && <InlineError>{forbiddenText}</InlineError>}
            </>
          )}
      </Section>

      <Section title={t('limits.title', 'Upload & storage limits')} bodyClassName="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState compact />
          ) : isError ? (
            <InlineError>{t('loadError', 'Could not load platform settings.')}</InlineError>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('limits.description', "Apply to every family on this deployment — families cannot change them. Leave a field blank to fall back to this server's own configuration.")}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t('limits.maxFileLabel', 'Max file size (MB)')}
                  type="number"
                  inputMode="numeric"
                  min={LIMIT_BOUNDS.maxFileMB.min}
                  max={LIMIT_BOUNDS.maxFileMB.max}
                    value={limitsForm.maxFileMB}
                  onChange={(e) => setLimitsForm((f) => ({ ...f, maxFileMB: e.target.value }))}
                  disabled={readOnly}
                  placeholder={defaultHint('maxFileMB', 'units.mb', '{{count}} MB')}
                  help={t('limits.maxFileHelp', 'Largest file allowed per upload (1–200 MB).')}
                />

                <Input
                  label={t('limits.storageLabel', 'Storage warning threshold (MB)')}
                  type="number"
                  inputMode="numeric"
                  min={LIMIT_BOUNDS.storageLimitMB.min}
                    value={limitsForm.storageLimitMB}
                  onChange={(e) => setLimitsForm((f) => ({ ...f, storageLimitMB: e.target.value }))}
                  disabled={readOnly}
                  placeholder={defaultHint('storageLimitMB', 'units.mb', '{{count}} MB')}
                  help={t('limits.storageHelp', "A family's admins get an email when its storage passes 80% and 95% of this (100 MB minimum).")}
                />
              </div>

              {/* Owner-only field on GET; an admin who doesn't get it sees it on Admin > System instead. */}
              {(!readOnly || data?.storageDriver) && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {t('limits.driverLabel', 'Storage driver')}:{' '}
                    <span className="font-normal text-neutral-900 dark:text-neutral-100">{driverLabel(data?.storageDriver)}</span>
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t('limits.driverHelp', 'Where uploaded files are stored. Changing it needs server configuration and a redeploy — it cannot be changed here.')}
                  </p>
                </div>
              )}

              {!readOnly && (
                <div className="kb-sticky flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                  <Button onClick={handleLimitsSave} loading={limitsSaving}>
                    {t('limits.save', 'Save limits')}
                  </Button>
                </div>
              )}

              {limitsForbidden && <InlineError>{forbiddenText}</InlineError>}
            </>
          )}
      </Section>

      <Section title={t('binRetention.title', 'Bin retention guidance')} bodyClassName="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState compact />
          ) : isError ? (
            <InlineError>{t('loadError', 'Could not load platform settings.')}</InlineError>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('binRetention.description', "Informational only — a guideline for how long deleted items are expected to sit in a family's bin before you clear them below. Nothing is ever deleted automatically, no matter what this is set to; every family's bin only empties when you permanently remove something yourself.")}
              </p>

              <Input
                label={t('binRetention.label', 'Suggested days in bin')}
                type="number"
                inputMode="numeric"
                min={30}
                max={3650}
                value={binRetentionField}
                onChange={(e) => setBinRetentionField(e.target.value)}
                disabled={readOnly}
                placeholder={t('binRetention.placeholder', 'No guidance set')}
                help={t('binRetention.help', '30–3650 days. Shown to you as a reminder only — it does not delete anything.')}
              />

              {!readOnly && (
                <div className="kb-sticky flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                  <Button onClick={handleBinRetentionSave} loading={binRetentionSaving}>
                    {t('binRetention.save', 'Save guidance')}
                  </Button>
                </div>
              )}

              {binRetentionForbidden && <InlineError>{forbiddenText}</InlineError>}
            </>
          )}
      </Section>

      <Section title={t('bin.title', 'Bin — permanently delete')} bodyClassName="space-y-4 p-4 sm:p-5">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('bin.description', "Every family's deleted documents, folders and vault items, across this whole deployment. Restoring something is a family's own job (their Bin page) — this is the only place anything is ever removed for good, files included. This cannot be undone.")}
          </p>

          {readOnly ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t('adminOps:settings.binReadOnly', 'Only the super admin can see and permanently delete what is in the bin.')}
            </p>
          ) : binLoading ? (
            <LoadingState compact />
          ) : binIsError ? (
            <InlineError>{t('bin.loadError', 'Could not load the bin.')}</InlineError>
          ) : binItems.length === 0 ? (
            <EmptyState variant="plain" size="sm" icon={<Trash2 className="w-10 h-10" />} title={t('bin.empty', "No family's bin has anything in it")} />
          ) : (
            <>
              <ListCard as="ul" className="max-h-[28rem] overflow-y-auto">
                {binItems.map((entry) => {
                  const key = `${entry.type}:${entry.id}`;
                  const { icon: Icon, kind } = BIN_KIND[entry.type] || BIN_KIND.document;
                  const title =
                    entry.type === 'file' && entry.documentTitle
                      ? t('bin.fileFrom', '{{name}}, from {{document}}', { name: entry.name || entry.originalName, document: entry.documentTitle })
                      : entry.name || entry.originalName;
                  const rowError = purgeErrors[key];
                  return (
                    <li key={key}>
                      <label className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 sm:px-5 dark:hover:bg-neutral-700/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 flex-shrink-0 accent-primary-500"
                          checked={selectedBinIds.has(key)}
                          onChange={() => toggleBinSelection(key)}
                        />
                        <Icon className={`${ITEM_ICON} ${KIND_ICON[kind]}`} strokeWidth={1.75} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
                          <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-neutral-400">
                            {t('bin.deletedAgo', '{{type}} · deleted {{when}}', {
                              type: t(`bin.type.${entry.type}`, BIN_TYPE_FALLBACK[entry.type] || entry.type),
                              when: formatRelativeTime(entry.deletedAt),
                            })}
                          </span>
                          {rowError && <span className="mt-0.5 block text-xs text-red-600 dark:text-red-400">{rowError}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ListCard>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                <Button
                  variant="danger"
                  disabled={selectedBinIds.size === 0}
                  onClick={() => setConfirmingPurge(true)}
                >
                  {t('bin.deleteSelected', 'Permanently delete selected ({{count}})', { count: selectedBinIds.size })}
                </Button>
              </div>

              {binForbidden && (
                <InlineError>
                  {t('bin.forbidden', "You don't have permission to do this. Only the configured platform owner can permanently delete bin contents.")}
                </InlineError>
              )}
              {binError && <InlineError>{binError}</InlineError>}
            </>
          )}
      </Section>

      <ConfirmDrawer
        isOpen={confirmingPurge}
        onClose={() => setConfirmingPurge(false)}
        onConfirm={handlePurgeSelected}
        title={t('bin.confirmTitle', 'Permanently delete these items?')}
        description={t('bin.confirmDescription', '{{count}} items and any files they contain will be removed for good. This cannot be undone.', { count: selectedBinIds.size })}
        confirmLabel={t('bin.confirmLabel', 'Delete permanently')}
      />

      <Section title={t('smtp.title', 'Email (SMTP)')} bodyClassName="space-y-4 p-4 sm:p-5">
          {isLoading ? (
            <LoadingState compact />
          ) : isError ? (
            <InlineError>{t('loadError', 'Could not load platform settings.')}</InlineError>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t('smtp.description', "Used to send password-reset links, invite emails and admin alerts for every family on this deployment. Leave a field blank to fall back to this server's own configuration.")}
              </p>

              <Notice tone="warning" className="space-y-1">
                <p>{t('smtp.renderNote', "Gmail SMTP does not work on Render's free plan (it blocks the usual mail ports).")}</p>
                <p>{t('smtp.brevoNote', 'Recommended: Brevo (free, 300 emails a day). Host smtp-relay.brevo.com, port 2525, secure connection off. Sign in with your Brevo SMTP login and an SMTP key.')}</p>
              </Notice>

              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400">{t('smtp.presets', 'Fill in for:')}</span>
                  {SMTP_PRESETS.map((preset) => (
                    <Button key={preset.key} variant="secondary" size="sm" onClick={() => applyPreset(preset)}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
              )}

              <Input
                label={t('smtp.hostLabel', 'SMTP server (host)')}
                value={smtpForm.host}
                onChange={updateSmtpField('host')}
                disabled={readOnly}
                placeholder={serverDefault}
                help={t('smtp.hostHelp', "The address of your email provider's outgoing mail server, e.g. smtp.gmail.com.")}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t('smtp.portLabel', 'Port')}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={smtpForm.port}
                  onChange={updateSmtpField('port')}
                  disabled={readOnly}
                  placeholder={serverDefault}
                  help={t('smtp.portHelp', 'Use 2525 with Brevo. Gmail uses 465 (secure on).')}
                />

                <ChoiceGroup
                  label={t('smtp.secureLabel', 'Secure connection (TLS/SSL)')}
                  columns={3}
                  disabled={readOnly}
                  value={smtpForm.secure}
                  onChange={(secure) => setSmtpForm((f) => ({ ...f, secure }))}
                  options={SECURE_OPTIONS.map((opt) => ({ value: opt.value, label: t(opt.labelKey, opt.fallback) }))}
                />
              </div>

              <Input
                label={t('smtp.userLabel', 'Sign-in username')}
                value={smtpForm.user}
                onChange={updateSmtpField('user')}
                disabled={readOnly}
                placeholder={serverDefault}
                help={t('smtp.userHelp', 'Usually your full email address.')}
                autoComplete="off"
              />

              <PasswordInput
                label={t('smtp.passLabel', 'Password')}
                value={smtpForm.pass}
                onChange={updateSmtpField('pass')}
                disabled={readOnly}
                placeholder={
                  hasPassword
                    ? t('smtp.passPlaceholderSaved', '•••••••• (leave blank to keep it)')
                    : t('smtp.passPlaceholderNone', 'No password saved yet')
                }
                help={t('smtp.passHelp', "Leave blank to keep the password already saved. Stored encrypted — it's never shown here again.")}
                autoComplete="new-password"
              />

              <Input
                label={t('smtp.fromLabel', '"From" name and address')}
                value={smtpForm.mailFrom}
                onChange={updateSmtpField('mailFrom')}
                disabled={readOnly}
                placeholder={serverDefault}
                help={t('smtp.fromHelp', 'What recipients see as the sender, e.g. "Family Vault <noreply@example.com>".')}
              />

              <Input
                label={t('smtp.replyToLabel', 'Reply-to address')}
                type="email"
                value={smtpForm.replyTo}
                onChange={updateSmtpField('replyTo')}
                disabled={readOnly}
                placeholder="you@gmail.com"
                help={t('smtp.replyToHelp', 'When someone presses Reply on an email from the app, the reply goes here. Leave blank for no reply address.')}
                autoComplete="email"
              />

              <div className="kb-sticky flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-700">
                <Button variant="secondary" onClick={handleTestEmail} loading={testSending}>
                  {t('smtp.sendTest', 'Send test email')}
                </Button>
                {!readOnly && (
                  <Button onClick={handleSmtpSave} loading={smtpSaving}>
                    {t('smtp.save', 'Save email settings')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t('smtp.testHelp', 'Save first — the test uses the saved settings and goes to your own email address.')}
              </p>

              {testResult && (
                <p
                  role="status"
                  className={`text-sm ${testResult.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                >
                  {testResult.ok
                    ? t('smtp.testSent', 'Test email sent to {{to}} — check your inbox (and spam).', { to: testResult.to })
                    : `${t('smtp.testNotSent', 'Test email was not sent.')} ${testResult.hint || ''}${testResult.code ? ` (${testResult.code})` : ''}`}
                </p>
              )}

              {smtpForbidden && <InlineError>{forbiddenText}</InlineError>}
            </>
          )}
      </Section>
    </div>
  );
}
