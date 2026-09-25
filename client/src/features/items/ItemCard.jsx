import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import { KeyRound, StickyNote } from 'lucide-react';

const KIND_META = {
  login: { icon: KeyRound, tone: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30' },
  note: { icon: StickyNote, tone: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
};

/**
 * One saved password or note in a list (Browse, search results) — links to `/items/:id`.
 * A password shows its username; a note shows the start of its text. The password itself is
 * never in list responses and never shown here.
 */
export default function ItemCard({ item }) {
  const { t } = useTranslation('items');
  const isNote = item?.kind === 'note';
  const meta = isNote ? KIND_META.note : KIND_META.login;
  const Icon = meta.icon;
  const secondLine = isNote
    ? String(item?.notes || '').split('\n').find((l) => l.trim()) || t('kinds.note', 'Note')
    : item?.username || t('kinds.login', 'Password');

  return (
    <Card as={Link} to={`/items/${item?.id}`} hover className="block">
      <CardBody padding="sm">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {item?.title || t('card.untitled', 'Untitled')}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{secondLine}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
