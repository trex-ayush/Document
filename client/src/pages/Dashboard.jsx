import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import PageHeader from '@/components/ui/PageHeader.jsx';
import { useAuth } from '@/context/AuthContext.jsx';
import { statsApi } from '@/services/statsApi.js';
import { AddButton } from '@/features/add/AddMenu.jsx';
import CountTile from '@/features/dashboard/CountTile.jsx';
import { greetingPart } from '@/features/dashboard/greeting.js';
import { FileText, Folder, KeyRound, StickyNote, Users } from 'lucide-react';

/**
 * Home (`/`): a greeting, how much the family has saved (Documents, Passwords, Notes,
 * Folders, Members — `GET /stats`) and one "+ Add" button. Nothing else.
 */
export default function Dashboard() {
  const { t } = useTranslation('dashboard');
  const { user, family } = useAuth();
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
    { key: 'documents', icon: FileText, label: t('counts.documents', 'Documents'), tone: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300' },
    { key: 'passwords', icon: KeyRound, label: t('counts.passwords', 'Passwords'), tone: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300' },
    { key: 'notes', icon: StickyNote, label: t('counts.notes', 'Notes'), tone: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
    { key: 'folders', icon: Folder, label: t('counts.folders', 'Folders'), tone: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
    { key: 'members', icon: Users, label: t('counts.members', 'Members'), tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  ];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageHeader
        title={firstName ? greetings[part] : noName[part]}
        subtitle={family?.name ? <span className="block break-words line-clamp-2" title={family.name}>{family.name}</span> : undefined}
        actions={<AddButton />}
      />

      <section aria-label={t('counts.label', 'What your family has saved')}>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-5">
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
        {isError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t('loadError', 'Could not load the numbers. Please refresh the page.')}</p>
        )}
      </section>
    </div>
  );
}
