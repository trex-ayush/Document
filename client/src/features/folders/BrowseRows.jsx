import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Folder, KeyRound, StickyNote } from 'lucide-react';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';
import FolderActionsMenu from './FolderActionsMenu.jsx';
import { folderName } from './folderTreeUtils.js';

/**
 * Rows for Browse's single list (and its in-folder search results): a folder, a document, or a
 * password/note. Every row is icon/thumbnail + title + one small meta line; tapping opens it.
 */

function Row({ to, visual, title, meta, snippet, action }) {
  return (
    <div className="flex items-center gap-1 pr-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 sm:pl-4">
        {visual}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</span>
          {meta && <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{meta}</span>}
          {snippet && <span className="mt-0.5 block truncate text-xs text-neutral-600 dark:text-neutral-300">{snippet}</span>}
        </span>
      </Link>
      {action ? <div className="flex-shrink-0">{action}</div> : <span className="h-10 w-2 flex-shrink-0" />}
    </div>
  );
}

function IconBox({ icon: Icon, tone = 'text-neutral-500 bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300' }) {
  return (
    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );
}

function folderMeta(folder, t) {
  const parts = [];
  const folders = folder.folderCount ?? 0;
  const docs = folder.documentCount ?? 0;
  const items = folder.itemCount ?? 0;
  if (folders) parts.push(folders === 1 ? t('common:units.folder_one', '{{count}} folder', { count: folders }) : t('common:units.folder_other', '{{count}} folders', { count: folders }));
  if (docs) parts.push(docs === 1 ? t('common:units.document_one', '{{count}} document', { count: docs }) : t('common:units.document_other', '{{count}} documents', { count: docs }));
  if (items) parts.push(items === 1 ? t('rows.itemCount_one', '{{count}} password or note', { count: items }) : t('rows.itemCount_other', '{{count}} passwords or notes', { count: items }));
  return parts.length ? parts.join(' · ') : t('rows.emptyFolder', 'Empty');
}

export function FolderListRow({ folder, meta, snippet, onRename, onMove, onDelete, showMenu = true }) {
  const { t } = useTranslation(['browse', 'common']);
  return (
    <Row
      to={`/browse/${folder.id}`}
      visual={<IconBox icon={Folder} tone="text-primary-600 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-300" />}
      title={folderName(folder, t)}
      meta={meta ?? folderMeta(folder, t)}
      snippet={snippet}
      action={
        showMenu ? (
          <FolderActionsMenu
            folder={folder}
            onRename={onRename && (() => onRename(folder))}
            onMove={onMove && (() => onMove(folder))}
            onDelete={onDelete && (() => onDelete(folder))}
          />
        ) : null
      }
    />
  );
}

export function DocumentListRow({ doc, meta, snippet }) {
  const { t } = useTranslation(['browse', 'common']);
  const thumb = doc.primaryThumbUrl || doc.thumbnailUrl;
  const files = doc.fileCount ?? doc.files?.length ?? 0;
  const defaultMeta = [
    formatDate(doc.createdAt || doc.updatedAt),
    files === 1 ? t('common:units.file_one', '{{count}} file', { count: files }) : t('common:units.file_other', '{{count}} files', { count: files }),
  ].filter(Boolean).join(' · ');
  return (
    <Row
      to={`/documents/${doc.id}`}
      visual={
        thumb ? (
          <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <img src={filesApi.resolveUrl(thumb)} alt="" loading="lazy" className="h-full w-full object-cover" />
          </span>
        ) : (
          <IconBox icon={FileText} />
        )
      }
      title={doc.title || t('rows.untitled', 'Untitled')}
      meta={meta ?? defaultMeta}
      snippet={snippet}
    />
  );
}

export function ItemListRow({ item, meta, snippet }) {
  const { t } = useTranslation(['browse', 'common']);
  const isNote = item.kind === 'note';
  const kindLabel = isNote ? t('rows.note', 'Note') : t('rows.password', 'Password');
  const defaultMeta = [kindLabel, formatDate(item.createdAt || item.updatedAt)].filter(Boolean).join(' · ');
  return (
    <Row
      to={`/items/${item.id}`}
      visual={
        <IconBox
          icon={isNote ? StickyNote : KeyRound}
          tone={isNote ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300' : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300'}
        />
      }
      title={item.title || t('rows.untitled', 'Untitled')}
      meta={meta ?? defaultMeta}
      snippet={snippet}
    />
  );
}

/** Wraps rows in the list card. */
export function BrowseListCard({ children }) {
  return (
    <div className="divide-y divide-neutral-100 overflow-visible rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-700 dark:bg-neutral-900">
      {children}
    </div>
  );
}
