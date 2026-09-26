import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Drawer from './Drawer.jsx';
import Button from './Button.jsx';
import { TriangleAlert } from 'lucide-react';

/**
 * ConfirmDrawer — the one yes/no confirmation (right-side drawer) for destructive or
 * important actions: icon + description, footer "Cancel | <confirm>" (confirm on the right).
 * Props: isOpen, onClose, onConfirm (may return a Promise), title, description?, confirmLabel?, cancelLabel?,
 * confirmVariant? ('danger' default), hideIcon?
 */
function ConfirmDrawer({
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
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('actions.cancel', 'Cancel')}
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm} loading={busy}>
            {confirmLabel ?? t('actions.confirm', 'Confirm')}
          </Button>
        </>
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
        {description && <p className="pt-2 text-sm text-neutral-700 dark:text-neutral-300">{description}</p>}
      </div>
    </Drawer>
  );
}

export default ConfirmDrawer;
