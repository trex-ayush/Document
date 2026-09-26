import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { InlineError } from '@/components/ui/PageState.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { statsApi } from '@/services/statsApi.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import HomeFolders from '@/features/dashboard/HomeFolders.jsx';
import SummaryPanel from '@/features/dashboard/SummaryPanel.jsx';
import StatCard from '@/components/ui/StatCard.jsx';
import { GRID_GAP } from '@/components/ui/tokens.js';
import { greetingPart } from '@/features/dashboard/greeting.js';
import { FileText, Folder, KeyRound, StickyNote, Users } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip.jsx';

/**
 * Home (`/`): a greeting, the family's numbers from `GET /stats` ("Saved": documents, passwords
 * and notes; "Family": members and folders — a two-part `SummaryPanel` on phones and tablets, three `StatCard`s on large screens), one "+ Add" button, and the family's top-level folders
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
    { key: 'documents', icon: FileText, label: t('counts.documents', 'Documents'), value: n('documents'), tip: t('tip.row.documents', 'How many documents you saved') },
    { key: 'passwords', icon: KeyRound, label: t('counts.passwords', 'Passwords'), value: n('passwords'), tip: t('tip.row.passwords', 'How many passwords you saved') },
    { key: 'notes', icon: StickyNote, label: t('counts.notes', 'Notes'), value: n('notes'), tip: t('tip.row.notes', 'How many notes you saved') },
  ];
  const membersRow = { key: 'members', icon: Users, label: t('counts.members', 'Members'), value: n('members'), to: '/members', tip: t('tip.row.members', 'See the people in your family') };
  const foldersRow = { key: 'folders', icon: Folder, label: t('counts.folders', 'Folders'), value: n('folders'), to: '/browse', tip: t('tip.row.folders', 'See all your folders') };

  // One card with two halves. "Family" has no total of its own (it would only repeat the
  // members row), so its header is just the title.
  const panelSections = [
    { key: 'saved', title: t('counts.saved', 'Saved'), total: n('documents') + n('passwords') + n('notes'), totalTip: t('tip.row.saved', 'Everything you saved, added up'), tone: 'primary', rows: savedRows },
    { key: 'family', title: t('counts.family', 'Family'), total: null, tone: 'green', rows: [membersRow, foldersRow] },
  ];
  // Large screens: three cards, each a number with one related number under it.
  const plural = (key, count, one, other) => t(`counts.sub.${key}`, { count, defaultValue: count === 1 ? one : other });
  const bigCards = [
    {
      key: 'documents', icon: FileText, tone: 'neutral', to: '/browse', value: n('documents'), label: t('counts.documents', 'Documents'),
      sub: { strong: n('files'), muted: plural('files', n('files'), 'file', 'files') },
      tip: t('tip.stat.documents', 'Documents you saved, and their files'),
    },
    {
      key: 'passwords', icon: KeyRound, tone: 'sky', to: '/browse', value: n('passwords'), label: t('counts.passwords', 'Passwords'),
      sub: { strong: n('notes'), muted: plural('notes', n('notes'), 'note', 'notes') },
      tip: t('tip.stat.passwords', 'Passwords you saved, and your notes'),
    },
    {
      key: 'members', icon: Users, tone: 'green', to: '/members', value: n('members'), label: t('counts.members', 'Members'),
      sub: { strong: n('folders'), muted: plural('folders', n('folders'), 'folder', 'folders') },
      tip: t('tip.stat.members', 'People in your family, and folders'),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={<span className="block truncate">{firstName ? greetings[part] : noName[part]}</span>}
        subtitle={
          family?.name ? (
            <Tooltip content={family.name} onlyWhenOverflow className="flex min-w-0">
              <span className="block min-w-0 break-words line-clamp-2">{family.name}</span>
            </Tooltip>
          ) : undefined
        }
        actions={isMobile ? undefined : <AddButton />}
      />

      <section aria-label={t('counts.label', 'What your family has saved')}>
        {/* Phones and tablets: one card with "Saved" and "Family" halves. Large screens: 3 cards in a row. */}
        <SummaryPanel className="lg:hidden" loading={isLoading} sections={panelSections} />
        <div className={`hidden lg:grid lg:grid-cols-3 ${GRID_GAP}`}>
          {bigCards.map(({ key, ...card }) => (
            <StatCard key={key} className="min-w-0" loading={isLoading} {...card} />
          ))}
        </div>
        {isError && <InlineError className="mt-3">{t('loadError', 'Could not load the numbers. Please refresh the page.')}</InlineError>}
      </section>

      <HomeFolders />
    </PageContainer>
  );
}
