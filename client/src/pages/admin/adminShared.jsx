import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ShieldOff } from 'lucide-react';
import Avatar from '@/components/ui/Avatar.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Button from '@/components/ui/Button.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { labelForAction } from '@/features/activity/actionLabels.js';
import { formatRelativeTime } from '@/i18n/formatters.js';

/**
 * Small building blocks shared by the admin pages this folder owns (Overview, Users, Families,
 * Admins). Everything renders metadata only — see docs/ADMIN_API.md's privacy rule.
 */

/** 1536 -> "1.5 KB". Latin digits in both languages, like the rest of the app. */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 12345 -> "12,345". */
export function formatCount(n) {
  return (Number(n) || 0).toLocaleString('en-IN');
}

export const isForbidden = (err) => err?.response?.status === 403;

/** The one card surface used across the admin pages. */
export function Section({ title, action, children, className = '', bodyClassName = 'p-4' }) {
  return (
    <section
      className={`rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800 ${className}`}
    >
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

/** Friendly "you can't be here" screen — the layout's gate and any 403 from an admin endpoint. */
export function NoAccess() {
  const { t } = useTranslation('admin');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        <ShieldOff className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 text-xl font-bold text-neutral-900 dark:text-neutral-100">{t('noAccess.title', "You don't have access")}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {t(
          'noAccess.description',
          'This area is only for the people who run this app. If you think you should have access, ask the super admin to add your email.',
        )}
      </p>
      <Button as={Link} to="/" className="mt-6 min-h-11">
        {t('noAccess.home', 'Go to home')}
      </Button>
    </div>
  );
}

/** Load error with a retry — or the no-access screen when the server said 403. */
export function ErrorBlock({ error, onRetry }) {
  const { t } = useTranslation('admin');
  if (isForbidden(error)) return <NoAccess />;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20">
      <p className="text-sm text-red-700 dark:text-red-300">{t('common.loadError', 'Could not load this. Please try again.')}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-3 min-h-11" onClick={() => onRetry()}>
          {t('common.retry', 'Try again')}
        </Button>
      )}
    </div>
  );
}

/** Previous / next with "21–40 of 132". Hidden when everything fits on one page. */
export function Pagination({ page, limit, total, onPageChange, disabled = false }) {
  const { t } = useTranslation('admin');
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  if (!total || pages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label={t('common.pagination', 'Pages')}>
      <Button
        variant="secondary"
        className="min-h-11"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        leftIcon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />}
      >
        {t('common.previous', 'Previous')}
      </Button>
      <span className="text-center text-xs text-neutral-500 dark:text-neutral-400 sm:text-sm">
        {t('common.showing', '{{from}}–{{to}} of {{total}}', { from, to, total: formatCount(total) })}
      </span>
      <Button
        variant="secondary"
        className="min-h-11"
        disabled={disabled || page >= pages}
        onClick={() => onPageChange(page + 1)}
        rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
      >
        {t('common.next', 'Next')}
      </Button>
    </nav>
  );
}

/** Label / value pair in a detail drawer. */
export function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="min-w-0 break-words text-right text-neutral-900 dark:text-neutral-100">{children}</dd>
    </div>
  );
}

/** Small heading inside a drawer. */
export function DrawerHeading({ children }) {
  return <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-500 first:mt-0 dark:text-neutral-400">{children}</h3>;
}

/** Super admin / Admin / Disabled / You badges for a UserRow. */
export function UserBadges({ user, isSelf = false }) {
  const { t } = useTranslation('admin');
  return (
    <>
      {user.isSuperAdmin && <Badge tone="purple">{t('role.super', 'Super admin')}</Badge>}
      {!user.isSuperAdmin && user.isAdmin && <Badge tone="blue">{t('role.admin', 'Admin')}</Badge>}
      {user.disabled && <Badge tone="red">{t('users.badges.disabled', 'Disabled')}</Badge>}
      {isSelf && <Badge tone="gray">{t('common.you', 'You')}</Badge>}
    </>
  );
}

/**
 * ActivityRow list (docs/ADMIN_API.md): who did what, to which item, in which family, when.
 * `showFamily` = false inside a family's own drawer.
 */
export function AdminActivityList({ items, showFamily = true, emptyText }) {
  const { t } = useTranslation(['admin', 'activity']);
  if (!items || items.length === 0) {
    return <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">{emptyText || t('activity.empty', 'No activity yet')}</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
      {items.map((a) => {
        const who = a.actor?.name || a.actor?.email || t('activity.someone', 'Someone');
        const where = [a.targetTitle, showFamily ? a.family?.name : null].filter(Boolean).join(' · ');
        return (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <Avatar user={{ name: who }} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-800 dark:text-neutral-200">
                <span className="font-medium">{who}</span>
                <span className="text-neutral-500 dark:text-neutral-400"> · {labelForAction(a.action, t)}</span>
              </p>
              {where && <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{where}</p>}
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs text-neutral-400">{formatRelativeTime(a.at)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Row of 44px filter chips (status filter etc.). `options`: [{ value, label }]. */
export function ChipGroup({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
              active
                ? 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700/50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
