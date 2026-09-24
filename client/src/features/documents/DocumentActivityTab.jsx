import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { useDocumentActivity } from './documentsHooks.js';

const ACTION_LABELS = {
  'document.create': 'Document created',
  'document.update': 'Document updated',
  'document.view': 'Document viewed',
  'document.delete': 'Document deleted',
  'field.update': 'Fields updated',
  'field.reveal': 'Sensitive value revealed',
  'file.download': 'File downloaded',
};

/** `GET /documents/:id/activity` — this document's own log only (docs/API.md). */
export default function DocumentActivityTab({ documentId }) {
  const { data, isLoading } = useDocumentActivity(documentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} height={44} rounded="lg" />)}
      </div>
    );
  }

  const items = data?.items || [];
  if (items.length === 0) {
    return <EmptyState variant="inline" title="No activity yet" />;
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2.5 text-sm dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-neutral-800 dark:text-neutral-100">
              {ACTION_LABELS[a.action] || a.action}
              {a.meta?.keys?.length ? ` — ${a.meta.keys.join(', ')}` : ''}
            </p>
            <p className="text-xs text-neutral-400">{a.actorName}</p>
          </div>
          <time className="flex-shrink-0 text-xs text-neutral-400">{new Date(a.createdAt).toLocaleString()}</time>
        </li>
      ))}
    </ul>
  );
}
