import { useTranslation } from 'react-i18next';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';

/** List row for a document (Browse, search results). */
export default function DocumentRow({ doc, onOpen }) {
  const { t } = useTranslation('common');
  return (
    <div
      className="flex min-h-[56px] cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2.5 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/60"
      onClick={() => onOpen(doc)}
    >
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
        {(doc.primaryThumbUrl || doc.thumbnailUrl) && (
          <img src={filesApi.resolveUrl(doc.primaryThumbUrl || doc.thumbnailUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{doc.title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {t('units.file', '{{count}} files', { count: doc.fileCount })} · {formatDate(doc.updatedAt)}
        </p>
      </div>
    </div>
  );
}
