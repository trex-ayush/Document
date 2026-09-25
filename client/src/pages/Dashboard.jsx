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
import { greetingPart } from '@/features/dashboard/greeting.js';
import { FileText, Folder, KeyRound, StickyNote, Users } from 'lucide-react';

/**
 * Home (`/`): a greeting, how much the family has saved (Documents, Passwords, Notes,
 * Folders, Members — `GET /stats`), one "+ Add" button, and the family's top-level folders
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

  // Tones follow the kind colours (docs/UI_KIT.md): documents neutral, passwords sky, notes violet,
  // folders coral; members green. Sub-lines are short static facts — no extra requests for them.
  const tiles = [
    {
      key: 'documents',
      icon: FileText,
      tone: 'neutral',
      label: t('counts.documents', 'Documents'),
      sub: { strong: t('counts.sub.documentsStrong', 'Aadhaar, PAN'), muted: t('counts.sub.documentsMuted', 'and more') },
    },
    {
      key: 'passwords',
      icon: KeyRound,
      tone: 'sky',
      label: t('counts.passwords', 'Passwords'),
      sub: { strong: t('counts.sub.passwordsStrong', 'Encrypted'), muted: t('counts.sub.passwordsMuted', 'saved safely') },
    },
    {
      key: 'notes',
      icon: StickyNote,
      tone: 'violet',
      label: t('counts.notes', 'Notes'),
      sub: { strong: t('counts.sub.notesStrong', 'Private'), muted: t('counts.sub.notesMuted', 'only your family') },
    },
    {
      key: 'folders',
      icon: Folder,
      tone: 'primary',
      to: '/browse',
      label: t('counts.folders', 'Folders'),
      sub: { muted: t('counts.sub.foldersMuted', 'including Shared') },
    },
    {
      key: 'members',
      icon: Users,
      tone: 'green',
      to: '/members',
      label: t('counts.members', 'Members'),
      sub: { muted: t('counts.sub.membersMuted', 'in your family') },
    },
  ];
  // Phones/tablets: 2 per row, the last card full width. PC: 3 on top, 2 wider ones below.
  const span = (i) => (i < 3 ? 'lg:col-span-2' : i === tiles.length - 1 ? 'col-span-2 lg:col-span-3' : 'lg:col-span-3');

  return (
    <PageContainer>
      <PageHeader
        title={<span className="block truncate">{firstName ? greetings[part] : noName[part]}</span>}
        subtitle={family?.name ? <span className="block break-words line-clamp-2" title={family.name}>{family.name}</span> : undefined}
        actions={isMobile ? undefined : <AddButton />}
      />

      <section aria-label={t('counts.label', 'What your family has saved')}>
        <div className={`grid grid-cols-2 lg:grid-cols-6 ${GRID_GAP}`}>
          {tiles.map((tile, i) => (
            <StatCard
              key={tile.key}
              className={`min-w-0 ${span(i)}`}
              icon={tile.icon}
              tone={tile.tone}
              label={tile.label}
              value={counts[tile.key] ?? 0}
              sub={tile.sub}
              to={tile.to}
              loading={isLoading}
            />
          ))}
        </div>
        {isError && <InlineError className="mt-3">{t('loadError', 'Could not load the numbers. Please refresh the page.')}</InlineError>}
      </section>

      <HomeFolders />
    </PageContainer>
  );
}
