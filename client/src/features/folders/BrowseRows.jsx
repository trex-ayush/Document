import { useTranslation } from 'react-i18next';
import { FileText, Folder, FolderHeart, KeyRound, StickyNote } from 'lucide-react';
import { filesApi } from '@/services/filesApi.js';
import { formatDate } from '@/i18n/formatters.js';
import { ListCard, ListIcon, ListRow } from '@/components/ui/ListRow.jsx';
import FolderActionsMenu from './FolderActionsMenu.jsx';
import { folderName } from './folderTreeUtils.js';

/**
 * Rows for Browse's single list (and its in-folder search results and Home's list view): a
 * folder, a document, or a password/note — all the shared `ListRow` (icon/thumbnail, title, one
 * small meta line); tapping opens it.
 */

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
    <ListRow
      to={`/browse/${folder.id}`}
      icon={<ListIcon icon={folder.isSystem ? FolderHeart : Folder} kind="folder" />}
      title={folderName(folder, t)}
      meta={meta ?? folderMeta(folder, t)}
      snippet={snippet}
      actions={
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
    <ListRow
      to={`/documents/${doc.id}`}
      icon={thumb ? <ListIcon src={filesApi.resolveUrl(thumb)} /> : <ListIcon icon={FileText} kind="document" />}
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
    <ListRow
      to={`/items/${item.id}`}
      icon={<ListIcon icon={isNote ? StickyNote : KeyRound} kind={isNote ? 'note' : 'password'} />}
      title={item.title || t('rows.untitled', 'Untitled')}
      meta={meta ?? defaultMeta}
      snippet={snippet}
    />
  );
}

/** Wraps rows in the list card (overflow visible so a row's "…" menu isn't clipped). */
export function BrowseListCard({ children }) {
  return <ListCard overflowVisible>{children}</ListCard>;
}
