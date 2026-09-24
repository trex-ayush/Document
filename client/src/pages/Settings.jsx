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
