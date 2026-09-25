import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import Badge from '@/components/ui/Badge.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmModal from '@/components/ui/ConfirmModal.jsx';
import { TrashIcon } from '@/components/layout/icons.jsx';
import { formatRelativeTime } from '@/i18n/formatters.js';
import { platformApi } from '@/services/platformApi.js';

const OPTIONS = [
  { value: 'google', label: 'Google only' },
  { value: 'password', label: 'Password only' },
  { value: 'both', label: 'Both' },
];

const OPTION_LABELS = Object.fromEntries(OPTIONS.map((o) => [o.value, o.label]));

// `secure` (TLS/SSL) is a 3-state field (`null` = "use this deployment's default", same as every
// other smtp.* field) — a plain on/off toggle can't represent "unset" without lying, so it gets
// the same small button-group treatment as the sign-in-method picker above, not a Switch.
const SECURE_OPTIONS = [
  { value: null, label: 'Use default' },
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
];

/** A possibly-null stored value -> the string an <Input> should show ('' = unset). */
function toFieldValue(value) {
  return value === null || value === undefined ? '' : String(value);
}

const emptySmtpForm = { host: '', port: '', secure: null, user: '', mailFrom: '', pass: '' };

/**
 * Standalone, top-level "Platform Settings" page (`/platform-settings`) — deployment-wide,
 * NOT per-family (docs/API.md "Platform settings"), so it deliberately is NOT nested under
 * the Settings tabs.
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
export default function PlatformSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => platformApi.get(),
  });

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
      queryClient.setQueryData(['platform-settings'], updated);
      toast.success('Platform sign-in policy saved');
      setEditing(false);
    } catch (err) {
      if (err?.response?.status === 403) {
        setForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not save the platform sign-in policy.');
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------- Activity log retention (deployment-wide default) ----------
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
        toast.error('Activity log retention must be between 30 and 3650 days, or blank to use this server’s default.');
        return;
      }
      activityRetentionDays = num;
    }

    setRetentionSaving(true);
    setRetentionForbidden(false);
    try {
      const updated = await platformApi.update({ activityRetentionDays });
      queryClient.setQueryData(['platform-settings'], updated);
      toast.success('Activity log retention default saved');
    } catch (err) {
      if (err?.response?.status === 403) {
        setRetentionForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not save the activity log retention default.');
      }
    } finally {
      setRetentionSaving(false);
    }
  };

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
        toast.error('Bin retention guidance must be between 30 and 3650 days, or blank.');
        return;
      }
      binRetentionDays = num;
    }

    setBinRetentionSaving(true);
    setBinRetentionForbidden(false);
    try {
      const updated = await platformApi.update({ binRetentionDays });
      queryClient.setQueryData(['platform-settings'], updated);
      toast.success('Bin retention guidance saved');
    } catch (err) {
      if (err?.response?.status === 403) {
        setBinRetentionForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not save the bin retention guidance.');
      }
    } finally {
      setBinRetentionSaving(false);
    }
  };

  // ---------- Bin (permanent delete — every family, platform owner only) ----------
  const { data: binData, isLoading: binLoading, isError: binIsError } = useQuery({
    queryKey: ['platform-bin'],
    queryFn: () => platformApi.listBin(),
  });
  const binItems = binData?.items || [];
  const [selectedBinIds, setSelectedBinIds] = useState(new Set());
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [binForbidden, setBinForbidden] = useState(false);

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
    try {
      const { results } = await platformApi.purgeBin(items);
      const failed = results.filter((r) => !r.purged);
      if (failed.length) {
        toast.error(`${results.length - failed.length} of ${results.length} removed permanently — ${failed.length} could not be removed.`);
      } else {
        toast.success(`${results.length} item${results.length === 1 ? '' : 's'} permanently removed`);
      }
      setSelectedBinIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['platform-bin'] });
    } catch (err) {
      if (err?.response?.status === 403) {
        setBinForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not permanently remove the selected items.');
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
      pass: '',
    });
  }, [data?.smtp]);

  const hasPassword = Boolean(data?.smtp?.hasPassword);

  const updateSmtpField = (key) => (e) => {
    setSmtpForm((f) => ({ ...f, [key]: e.target.value }));
  };

  const handleSmtpSave = async () => {
    // '' -> null (clear, fall back to the env default). Port additionally needs to parse as a
    // positive whole number when set.
    const host = smtpForm.host.trim() === '' ? null : smtpForm.host.trim();
    const user = smtpForm.user.trim() === '' ? null : smtpForm.user.trim();
    const mailFrom = smtpForm.mailFrom.trim() === '' ? null : smtpForm.mailFrom.trim();

    let port = null;
    if (smtpForm.port.toString().trim() !== '') {
      const num = Number(smtpForm.port);
      if (!Number.isInteger(num) || num <= 0) {
        toast.error('The SMTP port must be a positive whole number, or blank to use the default.');
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
      queryClient.setQueryData(['platform-settings'], updated);
      setSmtpForm((f) => ({ ...f, pass: '' }));
      toast.success('Email settings saved');
    } catch (err) {
      if (err?.response?.status === 403) {
        setSmtpForbidden(true);
      } else {
        toast.error(err?.response?.data?.message || 'Could not save the email settings.');
      }
    } finally {
      setSmtpSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Platform Settings"
        subtitle="Deployment-wide settings — apply to every family on this instance, not just one."
      />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Sign-in methods</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load platform settings.</p>
          ) : (
            <>
              <div>
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Allowed sign-in methods
                </p>

                {!editing ? (
                  <div className="flex items-center gap-3">
                    <Badge tone="blue">{OPTION_LABELS[current] || current}</Badge>
                    <Button variant="outline" size="sm" className="min-h-[44px]" onClick={startEditing}>
                      Edit
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-md">
                      {OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelected(opt.value)}
                          className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium transition-colors ${
                            selected === opt.value
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                              : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={handleSave} loading={saving}>
                        Save
                      </Button>
                      <Button variant="secondary" onClick={cancelEditing} disabled={saving}>
                        Cancel
                      </Button>
                    </div>

                    {forbidden && (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        You don&apos;t have permission to change this. Only the configured platform owner can update
                        deployment-wide settings.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Controls whether sign-in and sign-up across the whole deployment can use Google, password, or
                either — separate from any one member&apos;s own sign-in method (set per-member on the Members
                page).
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Activity log retention</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load platform settings.</p>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                The default number of days activity history is kept for every family on this deployment that hasn&apos;t
                set its own value (Settings &gt; System). Leave blank to fall back to this server&apos;s own
                configuration.
              </p>

              <Input
                label="Default retention (days)"
                type="number"
                inputMode="numeric"
                min={30}
                max={3650}
                value={retentionField}
                onChange={(e) => setRetentionField(e.target.value)}
                placeholder="Using this server's default"
                help="30–3650 days. A family can still set its own value that overrides this."
              />

              <div className="flex items-center gap-2">
                <Button onClick={handleRetentionSave} loading={retentionSaving}>
                  Save retention default
                </Button>
              </div>

              {retentionForbidden && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  You don&apos;t have permission to change this. Only the configured platform owner can update
                  deployment-wide settings.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Bin retention guidance</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load platform settings.</p>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Informational only — a guideline for how long deleted items are expected to sit in a family&apos;s
                bin before you clear them below. Nothing is ever deleted automatically, no matter what this is set
                to; every family&apos;s bin only empties when you permanently remove something yourself.
              </p>

              <Input
                label="Suggested days in bin"
                type="number"
                inputMode="numeric"
                min={30}
                max={3650}
                value={binRetentionField}
                onChange={(e) => setBinRetentionField(e.target.value)}
                placeholder="No guidance set"
                help="30–3650 days. Shown to you as a reminder only — it does not delete anything."
              />

              <div className="flex items-center gap-2">
                <Button onClick={handleBinRetentionSave} loading={binRetentionSaving}>
                  Save guidance
                </Button>
              </div>

              {binRetentionForbidden && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  You don&apos;t have permission to change this. Only the configured platform owner can update
                  deployment-wide settings.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Bin — permanently delete</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Every family&apos;s deleted documents, folders and vault items, across this whole deployment. Restoring
            something is a family's own job (their Bin page) — this is the only place anything is ever removed for
            good, files included. This cannot be undone.
          </p>

          {binLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : binIsError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load the bin.</p>
          ) : binItems.length === 0 ? (
            <EmptyState variant="plain" size="sm" icon={<TrashIcon className="w-10 h-10" />} title="No family's bin has anything in it" />
          ) : (
            <>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {binItems.map((entry) => {
                  const key = `${entry.type}:${entry.id}`;
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 min-h-[44px] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary-500 w-4 h-4 flex-shrink-0"
                        checked={selectedBinIds.has(key)}
                        onChange={() => toggleBinSelection(key)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{entry.name}</p>
                        <p className="text-xs text-neutral-400">
                          {entry.type} · deleted {formatRelativeTime(entry.deletedAt)}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  disabled={selectedBinIds.size === 0}
                  onClick={() => setConfirmingPurge(true)}
                >
                  Permanently delete selected ({selectedBinIds.size})
                </Button>
              </div>

              {binForbidden && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  You don&apos;t have permission to do this. Only the configured platform owner can permanently
                  delete bin contents.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <ConfirmModal
        isOpen={confirmingPurge}
        onClose={() => setConfirmingPurge(false)}
        onConfirm={handlePurgeSelected}
        title="Permanently delete these items?"
        description={`${selectedBinIds.size} item${selectedBinIds.size === 1 ? '' : 's'} and any files they contain will be removed for good. This cannot be undone.`}
        confirmLabel="Delete permanently"
      />

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Email (SMTP)</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load platform settings.</p>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Used to send password-reset links, invite emails and admin alerts for every family on this
                deployment. Leave a field blank to fall back to this server&apos;s own configuration.
              </p>

              <Input
                label="SMTP server (host)"
                value={smtpForm.host}
                onChange={updateSmtpField('host')}
                placeholder="Using this server's default"
                help="The address of your email provider's outgoing mail server, e.g. smtp.gmail.com."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Port"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={smtpForm.port}
                  onChange={updateSmtpField('port')}
                  placeholder="Using this server's default"
                  help="Usually 465 or 587 — check with your email provider."
                />

                <div>
                  <p className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Secure connection (TLS/SSL)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {SECURE_OPTIONS.map((opt) => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setSmtpForm((f) => ({ ...f, secure: opt.value }))}
                        className={`min-h-[44px] rounded-lg border px-2 text-xs sm:text-sm font-medium transition-colors ${
                          smtpForm.secure === opt.value
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Input
                label="Sign-in username"
                value={smtpForm.user}
                onChange={updateSmtpField('user')}
                placeholder="Using this server's default"
                help="Usually your full email address."
                autoComplete="off"
              />

              <Input
                label="Password"
                type="password"
                value={smtpForm.pass}
                onChange={updateSmtpField('pass')}
                placeholder={hasPassword ? '•••••••• (leave blank to keep it)' : 'No password saved yet'}
                help="Leave blank to keep the password already saved. Stored encrypted — it's never shown here again."
                autoComplete="new-password"
              />

              <Input
                label='"From" name and address'
                value={smtpForm.mailFrom}
                onChange={updateSmtpField('mailFrom')}
                placeholder="Using this server's default"
                help='What recipients see as the sender, e.g. "Family Vault <noreply@example.com>".'
              />

              <div className="flex items-center gap-2">
                <Button onClick={handleSmtpSave} loading={smtpSaving}>
                  Save email settings
                </Button>
              </div>

              {smtpForbidden && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  You don&apos;t have permission to change this. Only the configured platform owner can update
                  deployment-wide settings.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
