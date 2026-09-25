import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageContainer from '@/components/ui/PageContainer.jsx';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { InlineError } from '@/components/ui/PageState.jsx';
import { GRID_GAP, KIND_TONE } from '@/components/ui/tokens.js';
import { useAuth } from '@/context/AuthContext.jsx';
import { statsApi } from '@/services/statsApi.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import { useIsMobile } from '@/hooks/useIsMobile.js';
import CountTile from '@/features/dashboard/CountTile.jsx';
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

  const tiles = [
    { key: 'documents', icon: FileText, label: t('counts.documents', 'Documents'), tone: KIND_TONE.document },
    { key: 'passwords', icon: KeyRound, label: t('counts.passwords', 'Passwords'), tone: KIND_TONE.password },
    { key: 'notes', icon: StickyNote, label: t('counts.notes', 'Notes'), tone: KIND_TONE.note },
    { key: 'folders', icon: Folder, label: t('counts.folders', 'Folders'), tone: KIND_TONE.folder },
    { key: 'members', icon: Users, label: t('counts.members', 'Members'), tone: KIND_TONE.member },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={<span className="block truncate">{firstName ? greetings[part] : noName[part]}</span>}
        subtitle={family?.name ? <span className="block break-words line-clamp-2" title={family.name}>{family.name}</span> : undefined}
        actions={isMobile ? undefined : <AddButton />}
      />

      <section aria-label={t('counts.label', 'What your family has saved')}>
        <div className={`grid grid-cols-3 lg:grid-cols-5 ${GRID_GAP}`}>
          {tiles.map((tile) => (
            <CountTile
              key={tile.key}
              icon={tile.icon}
              tone={tile.tone}
              label={tile.label}
              value={counts[tile.key] ?? 0}
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
