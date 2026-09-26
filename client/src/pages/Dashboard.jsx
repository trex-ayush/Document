import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { InlineError } from '@/components/ui/PageState.jsx';
import StatCard from '@/components/ui/StatCard.jsx';
import { GRID_GAP } from '@/components/ui/tokens.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { statsApi } from '@/services/statsApi.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import HomeFolders from '@/features/dashboard/HomeFolders.jsx';
import SummaryPanel from '@/features/dashboard/SummaryPanel.jsx';
import { greetingPart } from '@/features/dashboard/greeting.js';
import { FileText, Folder, FolderLock, HouseHeart, KeyRound, StickyNote, Users } from 'lucide-react';

/**
 * Home (`/`): a greeting, the family's numbers from `GET /stats` ("Saved": documents, passwords
 * and notes; "Family": members and folders — one two-part `SummaryPanel` on phones, two
 * `StatCard`s from sm), one "+ Add" button, and the family's top-level folders
 * (grid or list). Nothing else.
 *
 * "+ Add" sits to the right of the greeting on PC; a long name is cut short with "…" so the button
 * never moves. Below 1024px the bottom bar already has + Add, so Home doesn't repeat it.
 */
export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { user, family } = useAuth();
  const isMobile = useIsMobile();
  const { data, isLoading, isError } = useQuery({ queryKey: ['stats'], queryFn: () => statsApi.get() });
  const counts = data?.counts || {};
  const firstName = user?.name?.trim().split(/\s+/)[0] || '';
  const part = greetingPart();
  const greetings = {
    morning: t('greeting.morning', 'Good morning, {{name}}', { name: firstName }),
    afternoon: t('greeting.afternoon', 'Good afternoon, {{name}}', { name: firstName }),
    evening: t('greeting.evening', 'Good evening, {{name}}', { name: firstName }),
  };
  const noName = {
    morning: t('greeting.morningNoName', 'Good morning'),
    afternoon: t('greeting.afternoonNoName', 'Good afternoon'),
    evening: t('greeting.eveningNoName', 'Good evening'),
  };

  // What the family has saved, and the family itself (GET /stats only).
  const n = (key) => counts[key] ?? 0;
  const savedRows = [
    { key: 'documents', icon: FileText, label: t('counts.documents', 'Documents'), value: n('documents') },
    { key: 'passwords', icon: KeyRound, label: t('counts.passwords', 'Passwords'), value: n('passwords') },
    { key: 'notes', icon: StickyNote, label: t('counts.notes', 'Notes'), value: n('notes') },
  ];
  const membersRow = { key: 'members', icon: Users, label: t('counts.members', 'Members'), value: n('members'), to: '/members' };
  const foldersRow = { key: 'folders', icon: Folder, label: t('counts.folders', 'Folders'), value: n('folders'), to: '/browse' };

  // Phones: one card with two halves. "Family" has no total of its own (it would only repeat
  // the members row), so its header is just the title.
  const panelSections = [
    { key: 'saved', title: t('counts.saved', 'Saved'), total: n('documents') + n('passwords') + n('notes'), tone: 'primary', rows: savedRows },
    { key: 'family', title: t('counts.family', 'Family'), total: null, tone: 'green', rows: [membersRow, foldersRow] },
  ];
  // From sm: two cards. The family card's big number is the members, so its rows don't repeat it.
  const cards = [
    { key: 'saved', icon: FolderLock, tone: 'primary', value: panelSections[0].total, label: t('counts.saved', 'Saved'), rows: savedRows },
    { key: 'family', icon: HouseHeart, tone: 'green', value: n('members'), label: t('counts.familyMembers', 'Family members'), rows: [foldersRow] },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={<span className="block truncate">{firstName ? greetings[part] : noName[part]}</span>}
        subtitle={family?.name ? <span className="block break-words line-clamp-2" title={family.name}>{family.name}</span> : undefined}
        actions={isMobile ? undefined : <AddButton />}
      />

      <section aria-label={t('counts.label', 'What your family has saved')}>
        {/* Phones: one compact card with two halves. From sm: the two summary cards. */}
        <SummaryPanel
          className="sm:hidden"
          loading={isLoading}
          sections={panelSections}
        />
        <div className={`hidden sm:grid sm:grid-cols-2 ${GRID_GAP}`}>
          {cards.map(({ key, ...card }) => (
            <StatCard key={key} className="min-w-0" loading={isLoading} {...card} />
          ))}
        </div>
        {isError && <InlineError className="mt-3">{t('loadError', 'Could not load the numbers. Please refresh the page.')}</InlineError>}
      </section>

      <HomeFolders />
    </PageContainer>
  );
}
