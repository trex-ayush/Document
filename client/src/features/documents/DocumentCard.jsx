import { useTranslation } from 'react-i18next';
import { Card, CardBody } from '@/components/ui/Card.jsx';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';
import { FileText } from 'lucide-react';

/** Grid tile for a document (Browse, search results). */
export default function DocumentCard({ doc, onOpen }) {
  const { t } = useTranslation('common');
  const thumb = doc.primaryThumbUrl || doc.thumbnailUrl;
  return (
    <Card hover className="cursor-pointer" onClick={() => onOpen(doc)}>
      <div className="aspect-[4/3] overflow-hidden rounded-t-2xl bg-neutral-100 dark:bg-neutral-800">
        {thumb ? (
          <img src={filesApi.resolveUrl(thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-300 dark:text-neutral-600">
            <FileText className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>
      <CardBody padding="sm">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{doc.title}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {t('units.file', '{{count}} files', { count: doc.fileCount })} · {formatDate(doc.updatedAt)}
        </p>
      </CardBody>
    </Card>
  );
}
