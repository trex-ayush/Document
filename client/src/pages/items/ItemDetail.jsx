import { useState } from 'react';
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
import CollapsibleText from '@/features/items/CollapsibleText.jsx';
import DetailAside from '@/features/items/DetailAside.jsx';
import { itemsApi } from '@/services/itemsApi.js';
import { useItem, useUpdateItem, useDeleteItem } from '@/features/items/itemsHooks.js';
import { Eye, EyeOff, FolderInput, KeyRound, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { useCanWrite } from '@/hooks/useCanWrite.js';

/**
 * One field: a small label, then the value with its buttons (show, copy) right after it — not
 * pushed to the far edge, so they stay next to what they act on at any width.
 */
function FieldRow({ label, children, actions }) {
  return (
    <div className="px-4 py-2.5 sm:px-5">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1">
        <div className="min-w-0 text-[15px] text-neutral-900 dark:text-neutral-100">{children}</div>
        {actions && <div className="-my-2 flex flex-shrink-0 items-center">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A "Keep secret" extra field (e.g. ATM PIN): shown as dots like the password, with show/hide and
 * copy right after it. Each secret field has its own show switch.
 */
function SecretFieldRow({ field, empty }) {
  const { t } = useTranslation(['items', 'common']);
  const [shown, setShown] = useState(false);
  const name = field.key;
  const toggleLabel = shown ? t('detail.hideField', 'Hide {{name}}', { name }) : t('detail.showField', 'Show {{name}}', { name });
  return (
    <FieldRow
      label={name}
      actions={
        field.value ? (
          <>
            <button
              type="button"
              onClick={() => setShown((v) => !v)}
              className={ROUND_ICON_BUTTON}
              aria-pressed={shown}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
            <CopyButton value={field.value} label={t('detail.copyField', 'Copy {{name}}', { name })} />
          </>
        ) : null
      }
    >
      {field.value ? (
        shown ? (
          <span className="block break-all font-mono tabular-nums">{field.value}</span>
        ) : (
          <span className="block tracking-[0.2em]" aria-label={t('detail.fieldHidden', '{{name}} hidden', { name })}>••••••••</span>
        )
      ) : (
        empty
      )}
    </FieldRow>
  );
}

/** Content left, "About" + "Recent activity" right from lg; one column (details last) below. */
const LAYOUT = 'grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]';

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
      <PageContainer>
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
      <PageContainer>
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
    <PageContainer>
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

      <div className={LAYOUT}>
      <div className="min-w-0">
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
            {fields.map((f, i) => (f.secret ? (
              <SecretFieldRow key={`${f.key}-${i}`} field={f} empty={empty} />
            ) : (
              <FieldRow
                key={`${f.key}-${i}`}
                label={f.key}
                actions={f.value ? <CopyButton value={f.value} label={t('detail.copyField', 'Copy {{name}}', { name: f.key })} /> : null}
              >
                {f.value ? <span className="block truncate" title={f.value}>{f.value}</span> : empty}
              </FieldRow>
            )))}
          </>
        )}
        {item.notes ? (
          <div className="px-4 py-2.5 sm:px-5">
            <div className="-my-2 flex items-center gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{t('form.notesLabel', 'Notes')}</p>
              <CopyButton value={item.notes} label={t('detail.copyNotes', 'Copy notes')} />
            </div>
            <CollapsibleText text={item.notes} className="mt-0.5 text-[15px] text-neutral-900 dark:text-neutral-100" />
          </div>
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
      </div>
      <DetailAside
        kind={item.kind}
        record={item}
        folderPath={where.path}
        activity={canWrite ? { queryKey: ['items', 'activity', item.id, item.updatedAt], queryFn: () => itemsApi.activity(item.id) } : null}
      />
      </div>

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
