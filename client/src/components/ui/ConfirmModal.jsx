import { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';

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
 *   onConfirm={() => sharesApi.update(share.id, { revoke: true })}
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
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
      </svg>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  hideIcon = false,
}) {
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        {!hideIcon && <WarningIcon tone={confirmVariant === 'danger' ? 'danger' : 'primary'} />}
        {description && <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>}
      </div>
    </Modal>
  );
}

export default ConfirmModal;
