import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { History, SlidersHorizontal, X } from 'lucide-react';
import Button from '@/components/ui/Button.jsx';
import SelectMenu from '@/components/ui/SelectMenu.jsx';
import Input from '@/components/ui/Input.jsx';
import Drawer from '@/components/ui/Drawer.jsx';
import Avatar from '@/components/ui/Avatar.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { FormField } from '@/components/ui/FormField.jsx';
import { ListCard, ListRow } from '@/components/ui/ListRow.jsx';
import { ErrorState, LoadingState } from '@/components/ui/PageState.jsx';
import { useDebouncedValue } from '@/hooks/useDebouncedValue.js';
import { ACTION_LABELS, continuationForAction, labelForAction } from '@/features/activity/actionLabels.js';
import { formatDateTime, formatRelativeTime } from '@/i18n/formatters.js';
import { adminOpsApi } from '@/services/adminOpsApi.js';

const EMPTY_FILTERS = { familyId: '', email: '', action: '', from: '', to: '' };
const PAGE_SIZE = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Admin > Activity (`/admin/activity`) — the activity log of every family on this deployment,
 * `GET /admin/activity` (docs/ADMIN_API.md, cursor pagination, "Load more"). Filters: family,
 * a person's email (looked up to a user id through `GET /admin/users`), action type and a date
 * range. On phones the filters live in a right-side drawer behind a "Filters" button.
 */
export default function AdminActivity() {
  const { t } = useTranslation(['adminOps', 'activity', 'common']);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: familiesData } = useQuery({
    queryKey: ['admin-ops', 'family-options'],
    queryFn: () => adminOpsApi.families({ limit: 100 }),
    staleTime: 5 * 60_000,
  });
  const families = useMemo(
    () => [...(familiesData?.items || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [familiesData],
  );

  // A typed email becomes a `userId` filter once it is a full address that matches an account.
  const email = useDebouncedValue(filters.email.trim().toLowerCase(), 400);
  const emailComplete = EMAIL_RE.test(email);
  const userLookup = useQuery({
    queryKey: ['admin-ops', 'user-by-email', email],
    queryFn: () => adminOpsApi.users({ q: email, limit: 10 }),
    enabled: emailComplete,
    staleTime: 60_000,
  });
  const matchedUser = emailComplete
    ? (userLookup.data?.items || []).find((u) => (u.email || '').toLowerCase() === email)
    : null;
  const emailWaiting = emailComplete && userLookup.isLoading;
  const emailNotFound = emailComplete && !userLookup.isLoading && !userLookup.isError && !matchedUser;
  const emailHint = filters.email.trim() && !EMAIL_RE.test(filters.email.trim())
    ? t('activity.emailHint', 'Type the full email address')
    : null;

  const queryParams = useMemo(
    () => ({
      familyId: filters.familyId,
      userId: matchedUser?.id || '',
      action: filters.action,
      from: filters.from,
      to: filters.to,
    }),
    [filters.familyId, filters.action, filters.from, filters.to, matchedUser?.id],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: ['admin-ops', 'activity', queryParams],
    queryFn: ({ pageParam }) => adminOpsApi.activity({ ...queryParams, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    enabled: !emailWaiting && !emailNotFound,
  });
  const items = data?.pages.flatMap((p) => p.items || []) || [];

  const activeCount = ['familyId', 'email', 'action', 'from', 'to'].filter((k) => String(filters[k]).trim() !== '').length;
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  let body;
  if (emailNotFound) {
    body = (
      <EmptyState
        icon={<History strokeWidth={1.5} />}
        title={t('activity.noUserTitle', 'No account uses this email')}
        description={t('activity.noUserDescription', 'Check the spelling, or clear the email filter to see everyone.')}
      />
    );
  } else if (isLoading || emailWaiting) {
    body = <LoadingState />;
  } else if (isError) {
    body = <ErrorState>{t('activity.loadError', 'Could not load the activity log.')}</ErrorState>;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<History strokeWidth={1.5} />}
        title={activeCount ? t('activity.emptyFilteredTitle', 'Nothing matches these filters') : t('activity.emptyTitle', 'No activity yet')}
        description={
          activeCount
            ? t('activity.emptyFilteredDescription', 'Try a wider date range or clear a filter.')
            : t('activity.emptyDescription', 'What people do in their family vaults will show up here.')
        }
      />
    );
  } else {
    body = (
      <>
        <ListCard>
          {items.map((row) => (
            <AdminActivityRow key={row.id} row={row} />
          ))}
        </ListCard>
        <div className="flex justify-center py-4">
          {hasNextPage ? (
            <Button variant="secondary" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              {t('loadMore', 'Load more')}
            </Button>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{t('activity.endOfList', "That's everything.")}</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t('activity.subtitle', 'Everything people have done, across every family')}
      </p>

      {/* Phones: one button that opens the filters in a drawer. */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button
          variant="secondary"
          leftIcon={<SlidersHorizontal className="h-4 w-4" />}
          onClick={() => setFiltersOpen(true)}
        >
          {activeCount
            ? t('activity.filtersCount', 'Filters ({{count}})', { count: activeCount })
            : t('activity.filters', 'Filters')}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>
            {t('activity.clearFilters', 'Clear')}
          </Button>
        )}
      </div>

      {/* PC: the filters sit above the list. */}
      <div className="hidden lg:block space-y-2">
        <FilterFields value={filters} onChange={setFilters} families={families} emailHint={emailHint} />
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={clearFilters}>
            {t('activity.clearFilters', 'Clear')}
          </Button>
        )}
      </div>

      <div>{body}</div>

      <Drawer
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        side="right"
        size="sm"
        title={t('activity.filters', 'Filters')}
        footer={
          <>
            <Button variant="secondary" onClick={clearFilters} disabled={activeCount === 0}>
              {t('activity.clearFilters', 'Clear')}
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>{t('activity.showResults', 'Show results')}</Button>
          </>
        }
      >
        <FilterFields value={filters} onChange={setFilters} families={families} emailHint={emailHint} withLabels />
      </Drawer>
    </div>
  );
}

/** The five filter controls. `withLabels` = stacked with visible labels (the phone drawer). */
function FilterFields({ value, onChange, families, emailHint, withLabels = false }) {
  const { t, i18n } = useTranslation(['adminOps', 'activity']);
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const setValue = (key) => (next) => onChange({ ...value, [key]: next });
  // Ids only in the drawer (for its labels) — the PC row is in the DOM at the same time.
  const fieldId = (key) => (withLabels ? `admin-activity-${key}` : undefined);

  const actionOptions = Object.keys(ACTION_LABELS)
    .map((code) => ({ value: code, label: labelForAction(code, t) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const labels = {
    family: t('activity.familyLabel', 'Family'),
    email: t('activity.emailLabel', "Person's email"),
    action: t('activity.actionLabel', 'What they did'),
    from: t('activity.fromLabel', 'From date'),
    to: t('activity.toLabel', 'To date'),
  };

  const controls = {
    family: (
      <SelectMenu
        id={fieldId('family')}
        value={value.familyId}
        onChange={setValue('familyId')}
        aria-label={labels.family}
        options={[{ value: '', label: t('activity.allFamilies', 'All families') }, ...families.map((f) => ({ value: f.id, label: f.name }))]}
      />
    ),
    email: (
      <Input
        id={fieldId('email')}
        type="email"
        inputMode="email"
        autoComplete="off"
        value={value.email}
        onChange={set('email')}
        placeholder={t('activity.emailPlaceholder', 'Anyone — or type an email')}
        aria-label={labels.email}
        help={emailHint || undefined}
      />
    ),
    action: (
      <SelectMenu
        id={fieldId('action')}
        value={value.action}
        onChange={setValue('action')}
        aria-label={labels.action}
        options={[{ value: '', label: t('activity.allActions', 'Anything') }, ...actionOptions]}
      />
    ),
    from: <Input id={fieldId('from')} type="date" value={value.from} onChange={set('from')} aria-label={labels.from} />,
    to: <Input id={fieldId('to')} type="date" value={value.to} onChange={set('to')} aria-label={labels.to} />,
  };

  if (withLabels) {
    return (
      <div className="space-y-4">
        {['family', 'email', 'action', 'from', 'to'].map((key) => (
          <FormField key={key} label={labels[key]} htmlFor={`admin-activity-${key}`}>
            {controls[key]}
          </FormField>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {controls.family}
      {controls.email}
      {controls.action}
      {controls.from}
      {controls.to}
    </div>
  );
}

/** "Ayush uploaded a document" / "“Aadhaar” · in Hemlata Family" / "2 hours ago". */
function AdminActivityRow({ row }) {
  const { t } = useTranslation(['adminOps', 'activity']);
  const name = row.actor?.name || row.actor?.email || t('activity.someone', 'Someone');
  const isAdminAction = (row.action || '').startsWith('admin.');
  const what = isAdminAction
    ? t('activity.adminAction', 'made an admin change ({{what}})', {
        what: row.action.slice('admin.'.length).replace(/[._]/g, ' '),
      })
    : continuationForAction(row.action, t);

  const meta = [
    row.targetTitle ? `“${row.targetTitle}”` : null,
    row.family?.name ? t('activity.inFamily', 'in {{family}}', { family: row.family.name }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      icon={<Avatar user={{ name }} size="md" />}
      wrapTitle
      title={
        <span title={row.actor?.email || undefined}>
          {name} <span className="font-normal text-neutral-600 dark:text-neutral-400">{what}</span>
        </span>
      }
      meta={meta || null}
      actions={
        <time
          dateTime={row.at}
          title={formatDateTime(row.at)}
          className="whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400"
        >
          {formatRelativeTime(row.at)}
        </time>
      }
    />
  );
}
