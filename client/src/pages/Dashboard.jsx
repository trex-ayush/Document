import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import Button from '@/components/ui/Button.jsx';
import Badge from '@/components/ui/Badge.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { UploadIcon, CameraIcon, FolderPlusIcon, FolderIcon, UsersIcon, ShareIcon, ActivityIcon } from '@/components/layout/icons.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { statsApi } from '@/services/statsApi.js';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';
import ActivityRow from '@/features/activity/ActivityRow.jsx';
import { useMembers } from '@/features/documents/documentsHooks.js';
import PersonTile from '@/features/people/PersonTile.jsx';
import { orderPeople } from '@/features/people/peopleUtils.js';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(val < 10 ? 1 : 0)} ${units[i]}`;
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatTile({ label, value }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{value}</p>
      </CardBody>
    </Card>
  );
}

function DocumentTile({ doc }) {
  return (
    <Link
      to={`/document/${doc.id}`}
      className="flex items-center gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-2.5 hover:border-primary-400 transition-colors min-h-[56px]"
    >
      <div className="w-10 h-10 rounded-md bg-neutral-100 dark:bg-neutral-800 flex-shrink-0 overflow-hidden flex items-center justify-center">
        {doc.primaryThumbUrl ? (
          <img src={filesApi.resolveUrl(doc.primaryThumbUrl)} alt="" className="w-full h-full object-cover" />
        ) : (
          <FolderIcon className="w-5 h-5 text-neutral-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{doc.title}</p>
        <p className="text-xs text-neutral-400">{formatDate(doc.updatedAt)}</p>
      </div>
    </Link>
  );
}

/**
 * Dashboard (`/`, index route). Quick actions use the same `?upload=1` /
 * `?upload=1&capture=1` / `?newFolder=1` query-param convention on `/browse`
 * that the FAB (`components/layout/Fab.jsx`, Agent D) already uses —
 * documented in docs/UI_KIT.md §9 for whoever builds Browse to read on
 * mount.
 */
export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { user, family, membership } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.get() });
  const { data: membersData, isLoading: membersLoading } = useMembers();
  const people = orderPeople(membersData?.items || [], membership?.id);
  const isAdmin = membership?.role === 'admin';

  const counts = data?.counts || {};
  const itemsByKind = data?.itemsByKind || {};
  const recentDocuments = data?.recentDocuments || [];
  const recentActivity = data?.recentActivity || [];
  const expiringSoon = data?.expiringSoon || [];
  // Missing key = 0 documents for that person (docs/API.md GET /stats `documentsByMember`).
  const docsByMember = data?.documentsByMember;
  const countFor = (key) => (docsByMember ? docsByMember[key] || 0 : undefined);

  const itemKindLabels = {
    login: t('itemKinds.login', 'Passwords & logins'),
    record: t('itemKinds.record', 'Numbers & records'),
    note: t('itemKinds.note', 'Secure notes'),
  };

  return (
    /* Extra bottom padding on mobile clears the floating "+" button (Fab.jsx sits ~4.5rem +
       safe-area above the tab bar, ~56px tall) so it never visually overlaps this page's last
       section (e.g. "Recent activity"'s header/"View all" link) — desktop has no Fab overlap
       concern since AppShell's <main> already handles that via lg:pb-0. */
    <div className="p-4 sm:p-6 pb-36 lg:pb-6 max-w-6xl mx-auto">
      <PageHeader
        title={t('welcomeBack', 'Welcome back, {{name}}', { name: user?.name?.split(' ')[0] || t('welcomeFallbackName', 'there') })}
        subtitle={family?.name}
      />

      {/* Member-first home (docs/DECISIONS.md "Member-first home"): one tile per person plus the
          family's shared documents — tap straight into a flat list, no folders in between. */}
      <section className="mb-6" aria-labelledby="people-heading">
        <div className="mb-3">
          <h2 id="people-heading" className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
            {t('people.title', 'Whose documents?')}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('people.subtitle', 'Tap a person to see their documents')}</p>
        </div>
        {membersLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={136} rounded="lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {people.map((m) => (
              <PersonTile key={m.id} member={m} count={countFor(m.id)} isYou={m.id === membership?.id} />
            ))}
            <PersonTile member={null} count={countFor('none')} />
          </div>
        )}
        {!membersLoading && people.length <= 1 && (
          <EmptyState
            variant="plain"
            size="sm"
            className="mt-2"
            title={t('people.onlyYou.title', 'Only you here so far')}
            description={t('people.onlyYou.description', 'Add your family members so each person has their own place for documents.')}
            action={isAdmin ? <Button as={Link} to="/members" variant="secondary">{t('people.onlyYou.action', 'Add a family member')}</Button> : undefined}
          />
        )}
        <div className="mt-3">
          <Link
            to="/browse"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            <FolderIcon className="w-4 h-4" />
            {t('people.browseByFolder', 'Browse by folder instead')}
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <Button as={Link} to="/browse?upload=1" variant="secondary" className="flex-col h-auto py-3 gap-1.5">
          <UploadIcon className="w-5 h-5" />
          <span className="text-xs">{t('quickActions.upload', 'Upload')}</span>
        </Button>
        <Button as={Link} to="/browse?upload=1&capture=1" variant="secondary" className="flex-col h-auto py-3 gap-1.5">
          <CameraIcon className="w-5 h-5" />
          <span className="text-xs">{t('quickActions.scan', 'Scan')}</span>
        </Button>
        <Button as={Link} to="/browse?newFolder=1" variant="secondary" className="flex-col h-auto py-3 gap-1.5">
          <FolderPlusIcon className="w-5 h-5" />
          <span className="text-xs">{t('quickActions.newFolder', 'New folder')}</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600 dark:text-red-400 text-center py-10">{t('loadError', 'Could not load your dashboard.')}</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label={t('stats.documents', 'Documents')} value={counts.documents ?? 0} />
            <StatTile label={t('stats.folders', 'Folders')} value={counts.folders ?? 0} />
            <StatTile label={t('stats.members', 'Members')} value={counts.members ?? 0} />
            <StatTile label={t('stats.activeShares', 'Active shares')} value={counts.activeShares ?? 0} />
          </div>

          {Object.keys(itemsByKind).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(itemsByKind).map(([kind, count]) => (
                <Badge key={kind} tone="purple">
                  {itemKindLabels[kind] || kind}: {count}
                </Badge>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t('recentlyAdded', 'Recently added')}</h2>
                <Link to="/browse" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                  {t('browseAll', 'Browse all')}
                </Link>
              </div>
              {recentDocuments.length === 0 ? (
                <EmptyState variant="plain" size="sm" title={t('noDocumentsYet', 'No documents yet')} />
              ) : (
                <div className="space-y-2">
                  {recentDocuments.map((doc) => (
                    <DocumentTile key={doc.id} doc={doc} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{t('recentActivity', 'Recent activity')}</h2>
                <Link to="/activity" className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                  <span className="inline-flex items-center gap-1">
                    <ActivityIcon className="w-3.5 h-3.5" /> {t('viewAll', 'View all')}
                  </span>
                </Link>
              </div>
              {recentActivity.length === 0 ? (
                <EmptyState variant="plain" size="sm" title={t('noActivityYet', 'No activity yet')} />
              ) : (
                <Card>
                  <CardBody padding="sm">
                    {recentActivity.slice(0, 6).map((a) => (
                      <ActivityRow key={a.id} activity={a} />
                    ))}
                  </CardBody>
                </Card>
              )}
            </section>
          </div>

          {expiringSoon.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-3">{t('expiringSoon', 'Expiring soon')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {expiringSoon.map((doc) => {
                  const days = daysUntil(doc.expiryDate);
                  return (
                    <Link
                      key={doc.id}
                      to={`/document/${doc.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 min-h-[44px]"
                    >
                      <span className="text-sm font-medium text-amber-800 dark:text-amber-300 truncate">{doc.title}</span>
                      <Badge tone="yellow">{days <= 0 ? t('expired', 'Expired') : t('daysLeft', '{{count}}d left', { count: days })}</Badge>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {counts.documents === 0 && recentDocuments.length === 0 && (
            <EmptyState
              icon={<FolderIcon className="w-16 h-16" />}
              title={t('emptyVault.title', 'Your vault is empty')}
              description={t('emptyVault.description', 'Upload your first document to get started.')}
              action={
                <Button as={Link} to="/browse?upload=1">
                  {t('emptyVault.action', 'Upload a document')}
                </Button>
              }
            />
          )}

          <div className="flex flex-wrap gap-3 text-xs text-neutral-400">
            <Link to="/members" className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400">
              <UsersIcon className="w-3.5 h-3.5" /> {t('members', 'Members')}
            </Link>
            <Link to="/shares" className="inline-flex items-center gap-1 hover:text-primary-600 dark:hover:text-primary-400">
              <ShareIcon className="w-3.5 h-3.5" /> {t('shares', 'Shares')}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
