import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Drawer from './Drawer.jsx';
import Button from './Button.jsx';
import { TriangleAlert } from 'lucide-react';

/**
 * ConfirmDrawer — right-side slide-in yes/no panel for destructive or
 * important actions. Same props as ConfirmModal: isOpen, onClose, onConfirm
 * (may return a Promise), title, description?, confirmLabel?, cancelLabel?,
 * confirmVariant? ('danger' default), hideIcon?
 */
export function ConfirmDrawer({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = 'danger',
  hideIcon = false,
}) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const danger = confirmVariant === 'danger';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      side="right"
      size="sm"
      title={title}
      footer={
        <div className="flex w-full flex-col gap-2 pb-[var(--safe-bottom)]">
          <Button variant={confirmVariant} block onClick={handleConfirm} loading={busy}>
            {confirmLabel ?? t('actions.confirm', 'Confirm')}
          </Button>
          <Button variant="ghost" size="sm" block onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('actions.cancel', 'Cancel')}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        {!hideIcon && (
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
              danger
                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
            }`}
          >
            <TriangleAlert className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>
        )}
        {description && <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>}
      </div>
    </Drawer>
  );
}

export default ConfirmDrawer;
