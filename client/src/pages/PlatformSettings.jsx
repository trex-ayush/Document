import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardHeader, CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import Badge from '@/components/ui/Badge.jsx';
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
                    <Button variant="outline" size="sm" onClick={startEditing}>
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
