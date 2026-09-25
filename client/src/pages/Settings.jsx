import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs.jsx';
import { SECTION_GAP } from '@/components/ui/tokens.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { familyApi } from '@/services/familyApi.js';
import SettingsProfile from './SettingsProfile.jsx';
import SettingsPassword from './SettingsPassword.jsx';
import SettingsFamily from './SettingsFamily.jsx';
import SettingsNotifications from './SettingsNotifications.jsx';

/**
 * Wraps `TabsList` in a width-constrained scroll container: `TabsList` is `inline-flex`, which
 * grows past a narrow screen instead of scrolling. This block-level wrapper is constrained to
 * the page width, so its own `overflow-x-auto` engages, and a small edge fade shows while
 * there's more to scroll (e.g. long Hindi tab names on a 360px phone).
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
          className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-lg bg-gradient-to-r from-neutral-100 to-transparent dark:from-neutral-900"
        />
      )}
      {canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-neutral-100 to-transparent dark:from-neutral-900"
        />
      )}
    </div>
  );
}

// Old /settings/<tab> links (from before the tabs were merged) land on the merged tab.
const TAB_FROM_PATH = {
  account: 'account',
  profile: 'account',
  password: 'account',
  theme: 'account',
  family: 'family',
  notifications: 'family',
};

/**
 * Settings page (`/settings`, `/settings/:tab`). Two tabs:
 *  - **My account** (everyone): Profile (name, avatar colour) and Password, each with its own Save.
 *  - **Family** (admins only): family name + default share-link duration, then the alert emails.
 * With only one tab to show (non-admins) there's no tab bar, just the content. Theme and
 * language live in the navbar's profile menu and the phone's More menu. Deployment-wide limits
 * and the sign-in policy are on the platform owner's `/platform-settings` page, not here.
 */
export default function Settings() {
  const { t } = useTranslation('settings');
  const { membership } = useAuth();
  const isAdmin = membership?.role === 'admin';
  const params = useParams();
  const navigate = useNavigate();

  const requested = TAB_FROM_PATH[(params['*'] || '').split('/')[0]] || 'account';
  const tab = requested === 'family' && !isAdmin ? 'account' : requested;
  const setTab = (next) => navigate(`/settings/${next}`, { replace: true });

  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => familyApi.get(), enabled: isAdmin });

  const account = (
    <div className={SECTION_GAP}>
      <SettingsProfile />
      <SettingsPassword />
    </div>
  );

  return (
    <PageContainer>
      <PageHeader title={t('pageTitle', 'Settings')} />
      {isAdmin ? (
        <Tabs value={tab} onValueChange={setTab}>
          <ScrollableTabsList>
            <TabsList>
              <TabsTrigger value="account">{t('tabs.account', 'My account')}</TabsTrigger>
              <TabsTrigger value="family">{t('tabs.family', 'Family')}</TabsTrigger>
            </TabsList>
          </ScrollableTabsList>
          <TabsContent value="account">{account}</TabsContent>
          <TabsContent value="family">
            <div className={SECTION_GAP}>
              <SettingsFamily family={family} />
              <SettingsNotifications family={family} />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        account
      )}
    </PageContainer>
  );
}
