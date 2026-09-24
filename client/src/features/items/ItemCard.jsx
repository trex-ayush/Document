import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Card, { CardBody } from '@/components/ui/Card.jsx';
import TagChip from '@/components/ui/TagChip.jsx';
// Reusing AppShell's Fab icons rather than duplicating the same kind glyphs — Fab already uses
// exactly these three (KeyIcon/HashIcon/NoteIcon) for "Add password/login"/"Add number/record"/
// "Add secure note", so an item's card and its creation entry point stay visually consistent.
import { KeyIcon, HashIcon, NoteIcon } from '@/components/layout/icons.jsx';

const KIND_META = {
  login: { icon: KeyIcon, tone: 'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-900/30' },
  record: { icon: HashIcon, tone: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30' },
  note: { icon: NoteIcon, tone: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
};

/**
 * ItemCard — renders one vault item (login/record/note) in Browse's grid/list (once that page
 * lands) and this module's own `/items` list. Consumes `ItemSummary` (docs/ITEMS.md): `{ id, kind,
 * title, tags, fieldCount, preview, updatedAt }`. `preview` is at most 2 NON-sensitive
 * `{key,value}` pairs — the server never sends a sensitive value in list results, so a sensitive
 * field always shows as a redacted placeholder here; the actual value only ever appears after an
 * explicit reveal on the detail page.
 */
export default function ItemCard({ item }) {
  const { t } = useTranslation('items');
  const meta = KIND_META[item?.kind] || KIND_META.record;
  const Icon = meta.icon;
  const kindShortLabels = {
    login: t('kindsShort.login', 'Login'),
    record: t('kindsShort.record', 'Record'),
    note: t('kindsShort.note', 'Note'),
  };
  const kindShortLabel = kindShortLabels[item?.kind] || kindShortLabels.record;
  const preview = item?.preview || [];
  const hiddenCount = Math.max((item?.fieldCount || 0) - preview.length, 0);
  const tags = item?.tags || [];

  return (
    <Card as={Link} to={`/items/${item?.id}`} hover className="block">
      <CardBody>
        <div className="flex items-start gap-3">
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.tone}`}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {item?.title || t('card.untitled', 'Untitled item')}
            </p>
            <div className="mt-1 space-y-0.5">
              {preview.map((f) => (
                <p key={f.key} className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {f.key}: {f.value || '—'}
                </p>
              ))}
              {hiddenCount > 0 && <p className="text-xs text-neutral-400 dark:text-neutral-500">{t('card.hiddenFields', '•••• hidden')}</p>}
              {preview.length === 0 && hiddenCount === 0 && (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">{kindShortLabel}</p>
              )}
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.slice(0, 3).map((tag) => (
                  <TagChip key={tag} tag={{ name: tag }} />
                ))}
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
