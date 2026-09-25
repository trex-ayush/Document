import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import { TriangleAlert } from 'lucide-react';

/**
 * ConfirmModal — reusable yes/no dialog for destructive or important
 * actions (delete document, revoke share, remove member). Awaits the
 * `onConfirm` promise and keeps the confirm button in `loading` state until
 * it resolves; closes itself on success.
 *
 * Ported from apps/component/src/components/ui/ConfirmModal.tsx (types
 * stripped), `ButtonVariant` mapped onto our Button's variant names
 * (`danger` default, since this dialog usually guards a destructive action).
 *
 * Props: isOpen, onClose, onConfirm (may return a Promise), title,
 * description?, confirmLabel? ('Confirm'), cancelLabel? ('Cancel'),
 * confirmVariant? ('danger' default — any Button variant), hideIcon?
 *
 * @example
 * <ConfirmModal
 *   isOpen={confirmOpen}
 *   onClose={() => setConfirmOpen(false)}
 *   onConfirm={() => sharesApi.revoke(share.id)}
 *   title="Revoke this share link?"
 *   description="Anyone with the link will immediately lose access."
 *   confirmLabel="Revoke"
 * />
 */
function WarningIcon({ tone }) {
  return (
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        tone === 'danger'
          ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
      }`}
    >
      <TriangleAlert className="w-5 h-5" strokeWidth={2} aria-hidden="true" />
    </div>
  );
}

export function ConfirmModal({
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
  const resolvedConfirmLabel = confirmLabel ?? t('actions.confirm', 'Confirm');
  const resolvedCancelLabel = cancelLabel ?? t('actions.cancel', 'Cancel');

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="w-full sm:w-auto">
            {resolvedCancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm} loading={busy} className="w-full sm:w-auto">
            {resolvedConfirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-start gap-4">
        {!hideIcon && <WarningIcon tone={confirmVariant === 'danger' ? 'danger' : 'primary'} />}
        {description && <p className="text-base leading-relaxed text-neutral-600 dark:text-neutral-300">{description}</p>}
      </div>
    </Modal>
  );
}

export default ConfirmModal;
