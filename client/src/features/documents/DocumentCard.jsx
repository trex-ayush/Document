import { Card, CardBody } from '@/components/ui/Card.jsx';
import TagChip from '@/components/ui/TagChip.jsx';
import { filesApi } from '@/services/filesApi.js';

/** Grid tile for a document inside Browse. */
export default function DocumentCard({ doc, onOpen }) {
  return (
    <Card hover className="cursor-pointer" onClick={() => onOpen(doc)}>
      <div className="aspect-[4/3] overflow-hidden rounded-t-2xl bg-neutral-100 dark:bg-neutral-800">
        {doc.primaryThumbUrl ? (
          <img src={filesApi.resolveUrl(doc.primaryThumbUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-300 dark:text-neutral-600">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 0H6.108c-1.135 0-2.098.845-2.192 1.976a48.424 48.424 0 00-1.652 4.284l.001.001M8.25 21h7.5A2.25 2.25 0 0018 18.75V7.5L14.25 3.75H8.25A2.25 2.25 0 006 6v12.75A2.25 2.25 0 008.25 21z" />
            </svg>
          </div>
        )}
      </div>
      <CardBody padding="sm">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{doc.title}</p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {doc.fileCount} file{doc.fileCount === 1 ? '' : 's'} · {new Date(doc.updatedAt).toLocaleDateString()}
        </p>
        {doc.tags?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map((t) => <TagChip key={t} tag={{ name: t }} />)}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
