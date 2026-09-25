import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Copy, File, FileText, Folder, Share2 } from 'lucide-react';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { familyApi } from '@/services/familyApi.js';
import { formatDateTime } from '@/i18n/formatters.js';
import { SHARE_DURATIONS, durationLabel, familyShareDuration } from './shareStatus.js';
import { copyText, WhatsAppIcon } from './shareLinkUtils.jsx';

/**
 * ShareDialog — the one share flow (`POST /shares`). Shows what is being shared, one
 * "Link valid for" choice (preselected from the family default), "Create link", then
 * WhatsApp / Copy link / Share. Anyone with the link sees only titles and files — never notes
 * or passwords — so there are no other options to think about.
 *
 * Normally opened through `ShareButton`, not rendered directly.
 *
 * Props: isOpen, onClose, targetType ('document'|'folder'), targetId, fileIds?, targetLabel?
 */
export default function ShareDialog({ isOpen, onClose, targetType, targetId, fileIds, targetLabel }) {
  const { t } = useTranslation(['shares', 'common']);
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const { data: family } = useQuery({ queryKey: ['family'], queryFn: () => familyApi.get(), enabled: isOpen });
  const [duration, setDuration] = useState(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    setCreating(false);
    setDuration(null);
  }, [isOpen, targetId]);

  const selected = duration || familyShareDuration(family);
  const fileCount = fileIds?.length || 0;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleCreate = async () => {
    setCreating(true);
    try {
      const payload = { targetType, targetId, duration: selected };
      if (fileCount) payload.fileIds = fileIds;
      const share = await sharesApi.create(payload);
      setCreated(share);
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    } catch (err) {
      toast.error(err?.response?.data?.message || t('dialog.createError', 'Could not make the link. Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  const label = targetLabel || '';
  const shareMessage = label
    ? t('dialog.shareMessageNamed', '“{{label}}” from Family Vault: {{url}}', { label, url: created?.url })
    : t('dialog.shareMessage', 'From Family Vault: {{url}}', { url: created?.url });

  const handleCopy = async () => {
    const ok = await copyText(created?.url || '', inputRef.current);
    if (ok) toast.success(t('dialog.copied', 'Link copied'));
    else toast.error(t('dialog.copyFailed', 'Could not copy. Press and hold the link to copy it.'));
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: label || t('dialog.nativeTitle', 'Shared from Family Vault'), text: shareMessage });
    } catch {
      // closed the share sheet — nothing to do
    }
  };

  // What the recipient will get, in plain words.
  let WhatIcon = FileText;
  let whatDetail = t('dialog.whatDocument', 'All files in this document');
  if (targetType === 'folder') {
    WhatIcon = Folder;
    whatDetail = t('dialog.whatFolder', 'Everything in this folder, including folders inside it');
  } else if (fileCount) {
    WhatIcon = File;
    whatDetail = fileCount === 1
      ? t('dialog.whatFiles_one', '{{count}} file', { count: fileCount })
      : t('dialog.whatFiles_other', '{{count}} files', { count: fileCount });
  }
  let whatTitle = label;
  if (!whatTitle) whatTitle = targetType === 'folder' ? t('dialog.thisFolder', 'This folder') : t('dialog.thisDocument', 'This document');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={created ? t('dialog.titleReady', 'Your link is ready') : t('dialog.title', 'Share')}
      size="sm"
      footer={
        created ? (
          <Button block onClick={onClose}>{t('common:actions.done', 'Done')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={creating}>{t('common:actions.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreate} loading={creating}>{t('dialog.create', 'Create link')}</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <WhatIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{whatTitle}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{whatDetail}</p>
          </div>
        </div>

        {created ? (
          <>
            <div>
              <input
                ref={inputRef}
                type="text"
                readOnly
                value={created.url || ''}
                onFocus={(e) => e.target.select()}
                aria-label={t('dialog.linkLabel', 'Share link')}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              />
              {created.expiresAt && (
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('dialog.worksUntil', 'Works until {{date}}', { date: formatDateTime(created.expiresAt) })}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Button
                as="a"
                href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="bare"
                block
                className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
                leftIcon={<WhatsAppIcon className="h-4 w-4" />}
              >
                {t('dialog.whatsapp', 'Send on WhatsApp')}
              </Button>
              <Button variant="secondary" block onClick={handleCopy} leftIcon={<Copy className="h-4 w-4" />}>
                {t('dialog.copy', 'Copy link')}
              </Button>
              {canNativeShare && (
                <Button variant="outline" block onClick={handleNativeShare} leftIcon={<Share2 className="h-4 w-4" />}>
                  {t('dialog.moreWays', 'Share another way')}
                </Button>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('dialog.manageHint', 'You can turn this link off any time from the Shares page.')}
            </p>
          </>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
                {t('dialog.validFor', 'Link valid for')}
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {SHARE_DURATIONS.map((value) => (
                  <label
                    key={value}
                    className={`flex min-h-10 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm transition-colors ${
                      selected === value
                        ? 'border-primary-500 bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                        : 'border-neutral-200 text-neutral-700 hover:border-primary-300 dark:border-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="share-duration"
                      value={value}
                      checked={selected === value}
                      onChange={() => setDuration(value)}
                      className="sr-only"
                    />
                    {durationLabel(value, t)}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('dialog.privacyNote', 'Anyone with the link can see and download the files. Notes and passwords are never shared.')}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
