import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Copy, File, FileText, Folder, Share2 } from 'lucide-react';
import Drawer from '@/components/ui/Drawer.jsx';
import Button from '@/components/ui/Button.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { familyApi } from '@/services/familyApi.js';
import { formatDateTime } from '@/i18n/formatters.js';
import { ListIcon } from '@/components/ui/ListRow.jsx';
import ChoiceGroup from '@/components/ui/ChoiceGroup.jsx';
import { FIELD_BORDER, FIELD_CONTROL, FIELD_HINT } from '@/components/ui/tokens.js';
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
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setCreated(null);
    setCreating(false);
    setDuration(null);
    setCopied(false);
  }, [isOpen, targetId]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

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
    if (ok) {
      toast.success(t('dialog.copied', 'Link copied'));
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    }
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
    <Drawer
      side="right"
      isOpen={isOpen}
      onClose={onClose}
      title={created ? t('dialog.titleReady', 'Your link is ready') : t('dialog.title', 'Share')}
      size="sm"
      footer={
        created ? (
          <Button onClick={onClose}>{t('common:actions.done', 'Done')}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={creating}>{t('common:actions.cancel', 'Cancel')}</Button>
            <Button onClick={handleCreate} loading={creating}>{t('dialog.create', 'Create link')}</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900">
          <ListIcon icon={WhatIcon} kind={targetType === 'folder' ? 'folder' : 'document'} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{whatTitle}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{whatDetail}</p>
          </div>
        </div>

        {created ? (
          <>
            <div>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  readOnly
                  value={created.url || ''}
                  onFocus={(e) => e.target.select()}
                  aria-label={t('dialog.linkLabel', 'Share link')}
                  className={`${FIELD_CONTROL} ${FIELD_BORDER} pr-12`}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? t('dialog.copied', 'Link copied') : t('dialog.copy', 'Copy link')}
                  className="absolute right-0 top-0 flex h-full w-11 items-center justify-center rounded-r-lg text-neutral-500 hover:text-primary-600 dark:text-neutral-300"
                >
                  {copied ? <Check className="h-5 w-5 text-green-600" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              <p className="sr-only" aria-live="polite">{copied ? t('dialog.copied', 'Link copied') : ''}</p>
              {created.expiresAt && (
                <p className={FIELD_HINT}>
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
              {canNativeShare && (
                <Button variant="ghost" block onClick={handleNativeShare} leftIcon={<Share2 className="h-4 w-4" />}>
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
            <ChoiceGroup
              name="share-duration"
              label={t('dialog.validFor', 'Link valid for')}
              value={selected}
              onChange={setDuration}
              options={SHARE_DURATIONS.map((value) => ({ value, label: durationLabel(value, t) }))}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('dialog.privacyNote', 'Anyone with the link can see and download the files. Notes and passwords are never shared.')}
            </p>
          </>
        )}
      </div>
    </Drawer>
  );
}
