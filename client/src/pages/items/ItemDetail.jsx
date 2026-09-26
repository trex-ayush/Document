import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import PageContainer from '@/components/ui/PageContainer.jsx';
import Button, { ICON_BUTTON_CLASS } from '@/components/ui/Button.jsx';
import { Skeleton, SkeletonHeader } from '@/components/ui/Skeleton.jsx';
import EmptyState from '@/components/ui/EmptyState.jsx';
import ConfirmDrawer from '@/components/ui/ConfirmDrawer.jsx';
import { DropdownDivider, DropdownItem } from '@/components/ui/Dropdown.jsx';
import { CARD_SURFACE } from '@/components/ui/tokens.js';
import FolderPicker from '@/features/folders/FolderPicker.jsx';
import FolderBreadcrumb from '@/features/documents/FolderBreadcrumb.jsx';
import { useFolderPath } from '@/features/documents/useFolderPath.js';
import CopyButton, { ROUND_ICON_BUTTON } from '@/features/items/CopyButton.jsx';
import DetailHeader from '@/features/items/DetailHeader.jsx';
import { useItem, useUpdateItem, useDeleteItem } from '@/features/items/itemsHooks.js';
import { Eye, EyeOff, FolderInput, KeyRound, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';

/** One field: a small label with its value under it, and its buttons on the same line. */
function FieldRow({ label, children, actions }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <div className="mt-0.5 min-w-0 text-[15px] text-neutral-900 dark:text-neutral-100">{children}</div>
      </div>
      {actions && <div className="-mr-2 flex flex-shrink-0 items-center">{actions}</div>}
    </div>
  );
}

/** Notes, cut to 4 lines with "Show more" when they're longer. */
function NotesText({ text }) {
  const { t } = useTranslation('items');
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setLong(el.scrollHeight > el.clientHeight + 1);
  }, [text, open]);
  return (
    <>
      <p ref={ref} className={`whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-4'}`}>{text}</p>
      {(long || open) && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          {open ? t('detail.showLess', 'Show less') : t('detail.showMore', 'Show more')}
        </button>
      )}
    </>
  );
}

/** `/items/:id` — one saved password or note. Items are not shareable. */
export default function ItemDetail() {
  const { t } = useTranslation(['items', 'common']);
  const canWrite = useCanWrite();
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useItem(id);
  const update = useUpdateItem(id);
  const del = useDeleteItem();
  const where = useFolderPath(item?.folderId);

  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (isLoading) {
    return (
      <PageContainer size="form">
        <SkeletonHeader action />
        <div className={`${CARD_SURFACE} divide-y divide-neutral-100 dark:divide-neutral-700`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3 sm:px-5">
              <Skeleton variant="line" width={90} />
              <Skeleton variant="line" height={14} width={`${50 - i * 10}%`} className="mt-2" />
            </div>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (isError || !item) {
    return (
      <PageContainer size="form">
        <EmptyState
          image="/assets/empty-documents.png"
          title={t('detail.notFoundTitle', 'Not found')}
          description={t('detail.notFoundDescription', 'It may have been moved to the Bin.')}
          action={<Button as={Link} to="/browse">{t('detail.goToFolders', 'Go to folders')}</Button>}
        />
      </PageContainer>
    );
  }

  const isNote = item.kind === 'note';
  const fields = (item.fields || []).filter((f) => f.key || f.value);
  const editTo = `/items/${item.id}/edit`;

  const handleMove = (folderId) => {
    const target = !folderId || folderId === 'root' ? where.sharedFolderId : folderId;
    if (!target || target === item.folderId) return;
    update.mutate(
      { folderId: target },
      {
        onSuccess: () => toast.success(t('detail.toasts.moved', 'Moved')),
        onError: (err) => toast.error(err?.response?.data?.message || t('detail.toasts.moveFailed', 'Could not move it')),
      },
    );
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(id);
      toast.success(t('detail.toasts.deleted', 'Moved to the Bin'));
      navigate(item.folderId ? `/browse/${item.folderId}` : '/browse', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('detail.toasts.deleteFailed', 'Could not delete it'));
    }
  };

  const empty = <span className="text-neutral-400 dark:text-neutral-500">—</span>;

  return (
    <PageContainer size="form">
      <DetailHeader
        breadcrumb={<FolderBreadcrumb path={where.path} />}
        title={item.title}
        chip={{ icon: isNote ? StickyNote : KeyRound, label: isNote ? t('kinds.note', 'Note') : t('kinds.login', 'Password') }}
        menuLabel={t('detail.moreActions', 'More actions')}
        actions={
          canWrite && (
            <>
              <Link to={editTo} className={`${ICON_BUTTON_CLASS} sm:hidden`} aria-label={t('common:actions.edit', 'Edit')} title={t('common:actions.edit', 'Edit')}>
                <Pencil className="h-5 w-5" aria-hidden="true" />
              </Link>
              <span className="hidden sm:block">
                <Button as={Link} to={editTo} variant="secondary" size="sm" leftIcon={<Pencil className="h-4 w-4" />}>
                  {t('common:actions.edit', 'Edit')}
                </Button>
              </span>
            </>
          )
        }
        menu={
          canWrite && (
            <>
              <DropdownItem onSelect={() => setMoveOpen(true)}>
                <span className="flex items-center gap-2"><FolderInput className="h-4 w-4" aria-hidden="true" />{t('common:actions.move', 'Move')}</span>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem danger onSelect={() => setDeleteOpen(true)}>
                <span className="flex items-center gap-2"><Trash2 className="h-4 w-4" aria-hidden="true" />{t('common:actions.delete', 'Delete')}</span>
              </DropdownItem>
            </>
          )
        }
      />

      {(!isNote || item.notes || canWrite) && (
      <div className={`${CARD_SURFACE} divide-y divide-neutral-100 dark:divide-neutral-700`}>
        {!isNote && (
          <>
            <FieldRow
              label={t('form.usernameLabel', 'Username / email')}
              actions={item.username ? <CopyButton value={item.username} label={t('detail.copyUsername', 'Copy username')} /> : null}
            >
              {item.username ? <span className="block truncate" title={item.username}>{item.username}</span> : empty}
            </FieldRow>
            <FieldRow
              label={t('form.passwordLabel', 'Password')}
              actions={
                item.password ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className={ROUND_ICON_BUTTON}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? t('common:actions.hidePassword', 'Hide password') : t('common:actions.showPassword', 'Show password')}
                      title={showPassword ? t('common:actions.hidePassword', 'Hide password') : t('common:actions.showPassword', 'Show password')}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                    <CopyButton value={item.password} label={t('detail.copyPassword', 'Copy password')} />
                  </>
                ) : null
              }
            >
              {item.password ? (
                showPassword ? (
                  <span className="block break-all font-mono tabular-nums">{item.password}</span>
                ) : (
                  <span className="block tracking-[0.2em]" aria-label={t('detail.passwordHidden', 'Password hidden')}>••••••••</span>
                )
              ) : (
                empty
              )}
            </FieldRow>
            {fields.map((f, i) => (
              <FieldRow
                key={`${f.key}-${i}`}
                label={f.key}
                actions={f.value ? <CopyButton value={f.value} label={t('detail.copyField', 'Copy {{name}}', { name: f.key })} /> : null}
              >
                {f.value ? <span className="block truncate" title={f.value}>{f.value}</span> : empty}
              </FieldRow>
            ))}
          </>
        )}
        {item.notes ? (
          <FieldRow label={t('form.notesLabel', 'Notes')} actions={<CopyButton value={item.notes} label={t('detail.copyNotes', 'Copy notes')} />}>
            <NotesText text={item.notes} />
          </FieldRow>
        ) : (
          canWrite && (
            <div className="px-4 py-2 sm:px-5">
              <Link to={editTo} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('detail.addNote', 'Add a note')}
              </Link>
            </div>
          )
        )}
      </div>
      )}

      <FolderPicker
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        onPick={handleMove}
        initialFolderId={item.folderId}
        title={t('detail.moveTitle', 'Move to…')}
      />

      <ConfirmDrawer
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('detail.deleteTitle', 'Delete “{{title}}”?', { title: item.title })}
        description={t('detail.deleteDescription', 'It moves to the Bin. You can bring it back from the Bin.')}
        confirmLabel={t('detail.moveToBin', 'Move to Bin')}
      />
    </PageContainer>
  );
}
