import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { EXPIRY_OPTIONS } from './shareStatus.js';

/**
 * ExtendShareModal — `PATCH /shares/:id` with `{ extendTo: expiresInCode }`.
 * Props: isOpen, onClose, share, onExtended?: (updatedShare) => void.
 */
export default function ExtendShareModal({ isOpen, onClose, share, onExtended }) {
  const { t } = useTranslation(['shares', 'common']);
  const [selected, setSelected] = useState('7d');
  const [submitting, setSubmitting] = useState(false);

  const handleExtend = async () => {
    if (!share) return;
    setSubmitting(true);
    try {
      const updated = await sharesApi.update(share.id, { extendTo: selected });
      toast.success(t('extendModal.extended', 'Expiry extended'));
      onExtended?.(updated);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('extendModal.error', 'Could not extend this link.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('extendModal.title', 'Extend expiry')}
      description={share?.targetLabel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {t('common:actions.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleExtend} loading={submitting}>
            {t('extendModal.extend', 'Extend')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {EXPIRY_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 min-h-[44px] text-sm cursor-pointer transition-colors border-neutral-200 dark:border-neutral-700 hover:border-primary-400 ${
              selected === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''
            }`}
          >
            <input
              type="radio"
              name="extend-to"
              value={opt.value}
              checked={selected === opt.value}
              onChange={() => setSelected(opt.value)}
              className="accent-primary-500"
            />
            {t(`expiryOptions.${opt.value}`, opt.label)}
          </label>
        ))}
      </div>
    </Modal>
  );
}
