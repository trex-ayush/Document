import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { familyApi } from '@/services/familyApi.js';
import SettingsProfile from './SettingsProfile.jsx';
import SettingsPassword from './SettingsPassword.jsx';
import SettingsAccount from './SettingsAccount.jsx';
import SettingsTheme from './SettingsTheme.jsx';
import SettingsFamily from './SettingsFamily.jsx';
import SettingsDocumentTypes from './SettingsDocumentTypes.jsx';
import SettingsNotifications from './SettingsNotifications.jsx';
import SettingsSystem from './SettingsSystem.jsx';

/**
 * Wraps `TabsList` in a width-constrained scroll container. `TabsList` itself is
 * `inline-flex` + `overflow-x-auto` (client/src/components/ui/Tabs.jsx, not editable
 * here) — an inline-flex box sizes to fit its content, so with 8 tabs (admin) it just
 * grows past the viewport instead of clipping/scrolling, which is exactly the "tabs
 * run off the right edge, no scroll hint" bug reported at 390px. This block-level
 * wrapper IS constrained to the page width, so its own `overflow-x-auto` is what
 * actually engages, and a small edge fade (shown only while there's more to scroll,
 * tracked via scroll position) makes the scrollability obvious — no fade/scroll-hint
 * pattern existed elsewhere in the app to reuse, so this is a minimal, local one.
 */
function ScrollableTabsList({ children }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  // Re-checked after every render (cheap — a handful of tab buttons) so it also
  // catches the admin-only tabs appearing once `membership` resolves, not just
  // viewport resizes.
  useEffect(() => {
    updateEdges();
  });

  useEffect(() => {
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, []);

  return (
    <div className="relative">
      <div ref={scrollRef} onScroll={updateEdges} className="overflow-x-auto scrollbar-hide">
        {children}
      </div>
      {canScrollLeft && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg bg-gradient-to-r from-neutral-100 dark:from-neutral-800 to-transparent"
        />
      )}
      {canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-neutral-100 dark:from-neutral-800 to-transparent"
        />
      )}
    </div>
  );
}

/**
 * Settings page (`/settings`). Profile/Password/Account/Theme are visible to
 * everyone; Family/Document Types/Notifications/System are admin-only tabs
 * (server-enforced too — hidden here to avoid dead UI for non-admins). System
 * holds per-family operational limits (max file size, activity retention,
 * storage warning threshold) — distinct from the standalone, deployment-wide
 * `/platform-settings` page, which isn't nested under these tabs at all.
 */
export default function Settings() {
  const { t } = useTranslation('settings');
  const { membership } = useAuth();
  const isAdmin = membership?.role === 'admin';

  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => familyApi.get() });

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <PageHeader title={t('pageTitle', 'Settings')} />
      <Tabs defaultValue="profile">
        <ScrollableTabsList>
          <TabsList>
            <TabsTrigger value="profile">{t('tabs.profile', 'Profile')}</TabsTrigger>
            <TabsTrigger value="password">{t('tabs.password', 'Password')}</TabsTrigger>
            <TabsTrigger value="account">{t('tabs.account', 'Account')}</TabsTrigger>
            <TabsTrigger value="theme">{t('tabs.theme', 'Theme')}</TabsTrigger>
            {isAdmin && <TabsTrigger value="family">{t('tabs.family', 'Family')}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="document-types">{t('tabs.documentTypes', 'Document types')}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="notifications">{t('tabs.notifications', 'Notifications')}</TabsTrigger>}
            {isAdmin && <TabsTrigger value="system">{t('tabs.system', 'System')}</TabsTrigger>}
          </TabsList>
        </ScrollableTabsList>

        <TabsContent value="profile">
          <SettingsProfile />
        </TabsContent>
        <TabsContent value="password">
          <SettingsPassword />
        </TabsContent>
        <TabsContent value="account">
          <SettingsAccount />
        </TabsContent>
        <TabsContent value="theme">
          <SettingsTheme />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="family">
            <SettingsFamily family={family} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="document-types">
            <SettingsDocumentTypes />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="notifications">
            <SettingsNotifications family={family} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="system">
            <SettingsSystem family={family} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
