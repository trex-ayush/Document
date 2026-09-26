import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Gauge, House, Link2, Server, Settings, ShieldCheck, Users } from 'lucide-react';
import Badge from '@/components/ui/Badge.jsx';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { PageSkeleton } from '@/components/ui/Skeleton.jsx';
import { TabLinks } from '@/components/ui/Tabs.jsx';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { NoAccess } from './adminShared.jsx';

// `end` on Overview so it isn't highlighted on every /admin/* page.
const TABS = [
  { to: '/admin', key: 'overview', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/users', key: 'users', label: 'Users', icon: Users },
  { to: '/admin/families', key: 'families', label: 'Families', icon: House },
  { to: '/admin/activity', key: 'activity', label: 'Activity', icon: Activity },
  { to: '/admin/shares', key: 'shares', label: 'Shares', icon: Link2 },
  { to: '/admin/admins', key: 'admins', label: 'Admins', icon: ShieldCheck },
  { to: '/admin/settings', key: 'settings', label: 'Settings', icon: Settings },
  { to: '/admin/system', key: 'system', label: 'System', icon: Server },
];

/**
 * AdminLayout — the `/admin` shell (docs/ADMIN_API.md "Client"): the standard page container
 * and header ("Admin panel" with the person's role badge and a one-line subtitle), then the
 * section tabs as the app's underline tab row (`TabLinks`, one route per tab; it scrolls sideways
 * on phones and keeps the current tab in view). Child pages render only their content through
 * `<Outlet/>`, starting with their own toolbar or stat cards.
 *
 * Anyone who isn't a super admin or admin gets a friendly "You don't have access" screen — a UI
 * nicety; every `/admin` endpoint 403s for them anyway.
 */
export default function AdminLayout() {
  const { t } = useTranslation('admin');
  const { isPlatformAdmin, platformRole, isLoading } = usePlatformOwner();

  if (isLoading) return <PageSkeleton />;
  if (!isPlatformAdmin) return <NoAccess />;

  return (
    <PageContainer>
      <PageHeader
        title={t('title', 'Admin')}
        titleAddon={
          <Badge tone={platformRole === 'super' ? 'purple' : 'blue'}>
            {platformRole === 'super' ? t('role.super', 'Super admin') : t('role.admin', 'Admin')}
          </Badge>
        }
        subtitle={t('subtitle', 'People, families, share links and settings for everyone using this app.')}
      />

      <TabLinks
        aria-label={t('tabsLabel', 'Admin sections')}
        className="mb-4 sm:mb-6"
        items={TABS.map((tab) => ({ ...tab, label: t(`tabs.${tab.key}`, tab.label) }))}
      />

      <Outlet />
    </PageContainer>
  );
}
