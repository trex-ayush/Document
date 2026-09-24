import { useTranslation } from 'react-i18next';
import TagChip from '@/components/ui/TagChip.jsx';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';

/** List-view row for a document inside Browse. */
export default function DocumentRow({ doc, onOpen }) {
  const { t } = useTranslation('common');
  return (
    <div
      className="flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2.5 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
      onClick={() => onOpen(doc)}
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
        {doc.primaryThumbUrl && (
          <img src={filesApi.resolveUrl(doc.primaryThumbUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{doc.title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('units.file', '{{count}} files', { count: doc.fileCount })} · {formatDate(doc.updatedAt)}
        </p>
      </div>
      {doc.tags?.length > 0 && (
        <div className="hidden flex-shrink-0 gap-1 sm:flex">
          {doc.tags.slice(0, 2).map((tag) => <TagChip key={tag} tag={{ name: tag }} />)}
        </div>
      )}
    </div>
  );
}
