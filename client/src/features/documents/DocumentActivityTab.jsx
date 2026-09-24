import { useTranslation } from 'react-i18next';
import Skeleton from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import { formatDateTime } from '@/i18n/formatters.js';
import { useDocumentActivity } from './documentsHooks.js';

const ACTION_KEYS = {
  'document.create': 'activity.actions.documentCreate',
  'document.update': 'activity.actions.documentUpdate',
  'document.view': 'activity.actions.documentView',
  'document.delete': 'activity.actions.documentDelete',
  'field.update': 'activity.actions.fieldUpdate',
  'field.reveal': 'activity.actions.fieldReveal',
  'file.download': 'activity.actions.fileDownload',
};

const ACTION_FALLBACKS = {
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
  const { t } = useTranslation('documents');
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
    return <EmptyState variant="inline" title={t('activity.emptyTitle', 'No activity yet')} />;
  }

  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 px-3 py-2.5 text-sm dark:border-neutral-800">
          <div className="min-w-0">
            <p className="text-neutral-800 dark:text-neutral-100">
              {ACTION_KEYS[a.action] ? t(ACTION_KEYS[a.action], ACTION_FALLBACKS[a.action]) : a.action}
              {a.meta?.keys?.length ? ` — ${a.meta.keys.join(', ')}` : ''}
            </p>
            <p className="text-xs text-neutral-400">{a.actorName}</p>
          </div>
          <time className="flex-shrink-0 text-xs text-neutral-400">{formatDateTime(a.createdAt)}</time>
        </li>
      ))}
    </ul>
  );
}
