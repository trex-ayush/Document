import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Gauge, House, Link2, Server, Settings, ShieldCheck, Users } from 'lucide-react';
import Badge from '@/components/ui/Badge.jsx';
import { usePlatformOwner } from '@/hooks/usePlatformOwner.js';
import { LoadingBlock, NoAccess } from './adminShared.jsx';

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

const CHIP_ACTIVE = 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300';
const CHIP_IDLE =
  'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700/50';

/**
 * AdminLayout — the `/admin` shell (docs/ADMIN_API.md "Client"): page container, "Admin" title
 * with the person's role badge, and the section tabs as one row of chips. The row scrolls sideways
 * on its own (never the page) and keeps the active chip in view. Child pages render only their
 * content through `<Outlet/>`.
 *
 * Anyone who isn't a super admin or admin gets a friendly "You don't have access" screen — a UI
 * nicety; every `/admin` endpoint 403s for them anyway.
 */
export default function AdminLayout() {
  const { t } = useTranslation('admin');
  const { isPlatformAdmin, platformRole, isLoading } = usePlatformOwner();
  const { pathname } = useLocation();
  const scrollerRef = useRef(null);

  // Scroll only the chip row (not the page) so the active chip sits in the middle.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector('[aria-current="page"]');
    if (!scroller || !active) return;
    const left = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [pathname, isPlatformAdmin]);

  if (isLoading) return <LoadingBlock />;
  if (!isPlatformAdmin) return <NoAccess />;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 sm:text-2xl">{t('title', 'Admin')}</h1>
        <Badge tone={platformRole === 'super' ? 'purple' : 'blue'}>
          {platformRole === 'super' ? t('role.super', 'Super admin') : t('role.admin', 'Admin')}
        </Badge>
      </div>

      <nav aria-label={t('tabsLabel', 'Admin sections')} className="mb-4 min-w-0 sm:mb-6">
        <div ref={scrollerRef} className="relative overflow-x-auto scrollbar-hide">
          <ul className="flex w-max gap-2 pb-1">
            {TABS.map((tab) => (
              <li key={tab.key} className="shrink-0">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors ${
                      isActive ? CHIP_ACTIVE : CHIP_IDLE
                    }`
                  }
                >
                  <tab.icon className="h-4 w-4" aria-hidden="true" />
                  {t(`tabs.${tab.key}`, tab.label)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
