import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal.jsx';
import Button from '@/components/ui/Button.jsx';
import Input from '@/components/ui/Input.jsx';
import Switch from '@/components/ui/Switch.jsx';
import FormField from '@/components/ui/FormField.jsx';
import Spinner from '@/components/ui/Spinner.jsx';
import { sharesApi } from '@/services/sharesApi.js';
import { EXPIRY_OPTIONS, SENSITIVE_ALLOWED_EXPIRY } from './shareStatus.js';

/**
 * Zod issue messages here are short keys (not English text) — `zod`'s
 * `.superRefine`/`.max` run outside React, so they can't call `t()`
 * themselves. Render sites translate the key via `fieldError()` below,
 * which stays reactive to the current language since it runs at render
 * time, unlike the schema (built once).
 */
const FIELD_ERROR_FALLBACK = {
  passwordRequiredForSensitive: 'A password is required when sharing sensitive fields',
  expiryRestricted: 'Must expire within 24 hours',
  selectAtLeastOneFile: 'Select at least one file',
  labelTooLong: 'Keep it under 120 characters',
};

function fieldError(t, message) {
  if (!message) return undefined;
  return t(`createModal.errors.${message}`, FIELD_ERROR_FALLBACK[message] || message);
}

const shareSchema = z
  .object({
    expiresIn: z.enum(['1h', '2h', '24h', '7d', '30d', 'never']),
    allowDownload: z.boolean(),
    password: z.string().optional(),
    label: z.string().max(120, 'labelTooLong').optional(),
    includeSensitive: z.boolean(),
    fileMode: z.enum(['all', 'specific']),
    fileIds: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.includeSensitive) {
      if (!data.password || !data.password.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'passwordRequiredForSensitive' });
      }
      if (!SENSITIVE_ALLOWED_EXPIRY.has(data.expiresIn)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresIn'], message: 'expiryRestricted' });
      }
    }
    if (data.fileMode === 'specific' && (!data.fileIds || data.fileIds.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fileIds'], message: 'selectAtLeastOneFile' });
    }
  });

/**
 * ShareCreateModal — reusable share-creation flow for `POST /shares`
 * (docs/API.md "Shares"). Self-contained: caller only needs to control
 * `isOpen`/`onClose` and pass the target — no coordination needed with
 * whichever page triggers it (Browse's per-item "Share" action, a document
 * detail page, or this app's own Shares management page).
 *
 * Props:
 *  - isOpen, onClose
 *  - targetType: 'document' | 'folder' | 'item' (required)
 *  - targetId: string (required)
 *  - targetLabel?: string — shown in the modal header ("Share \"<label>\"")
 *  - files?: Array<{ id, label }> — only meaningful when targetType is
 *    'document' and there's more than one file; lets the user pick "all
 *    files" or specific ones. Omit/empty for folder/item shares or a
 *    single-file document.
 *  - onCreated?: (share) => void — called with the created Share (including
 *    the one-time `url`) right after a successful POST /shares.
 *
 * Folder shares never show the "include sensitive fields" toggle at all
 * (server: `400 FOLDER_SHARE_NO_SENSITIVE`). When the toggle is on, expiry
 * is restricted to `1h|2h|24h` and a password becomes required — enforced
 * here client-side (disabling the longer expiry options, not just
 * validating) to mirror the server's own hard invariant instead of letting
 * the user pick a bad combination and then fail server-side.
 *
 * @example
 * <ShareCreateModal
 *   isOpen={shareOpen}
 *   onClose={() => setShareOpen(false)}
 *   targetType="document"
 *   targetId={doc.id}
 *   targetLabel={doc.title}
 *   files={doc.files?.map(f => ({ id: f.id, label: f.label }))}
 *   onCreated={(share) => console.log('share url (one-time):', share.url)}
 * />
 */
export default function ShareCreateModal({ isOpen, onClose, targetType, targetId, targetLabel, files = [], onCreated }) {
  const { t } = useTranslation(['shares', 'common']);
  const [step, setStep] = useState('form'); // 'form' | 'success'
  const [createdShare, setCreatedShare] = useState(null);

  const showFilePicker = targetType === 'document' && files.length > 1;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(shareSchema),
    defaultValues: {
      expiresIn: '7d',
      allowDownload: true,
      password: '',
      label: '',
      includeSensitive: false,
      fileMode: 'all',
      fileIds: [],
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        expiresIn: '7d',
        allowDownload: true,
        password: '',
        label: '',
        includeSensitive: false,
        fileMode: 'all',
        fileIds: [],
      });
      setStep('form');
      setCreatedShare(null);
    }
  }, [isOpen, reset]);

  const includeSensitive = watch('includeSensitive');
  const expiresIn = watch('expiresIn');
  const fileMode = watch('fileMode');
  const selectedFileIds = watch('fileIds') || [];

  useEffect(() => {
    if (includeSensitive && !SENSITIVE_ALLOWED_EXPIRY.has(expiresIn)) {
      setValue('expiresIn', '24h');
    }
  }, [includeSensitive, expiresIn, setValue]);

  const toggleFile = (id) => {
    const next = selectedFileIds.includes(id)
      ? selectedFileIds.filter((x) => x !== id)
      : [...selectedFileIds, id];
    setValue('fileIds', next, { shouldValidate: true });
  };

  const onSubmit = async (data) => {
    const payload = {
      targetType,
      targetId,
      expiresIn: data.expiresIn,
      allowDownload: data.allowDownload,
      includeSensitive: targetType === 'folder' ? false : data.includeSensitive,
    };
    if (data.password?.trim()) payload.password = data.password.trim();
    if (data.label?.trim()) payload.label = data.label.trim();
    if (showFilePicker && data.fileMode === 'specific') payload.fileIds = data.fileIds;

    try {
      const share = await sharesApi.create(payload);
      setCreatedShare(share);
      setStep('success');
      onCreated?.(share);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('createModal.createError', 'Could not create the share link.'));
    }
  };

  const handleClose = () => {
    setStep('form');
    setCreatedShare(null);
    onClose?.();
  };

  const handleCopy = async () => {
    if (!createdShare?.url) return;
    try {
      await navigator.clipboard.writeText(createdShare.url);
      toast.success(t('createModal.copyLinkSuccess', 'Link copied'));
    } catch {
      toast.error(t('createModal.copyLinkError', 'Could not copy — select and copy the link manually.'));
    }
  };

  const handleNativeShare = async () => {
    if (!createdShare?.url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: targetLabel || t('createModal.nativeShareTitleFallback', 'Shared from Family Vault'), url: createdShare.url });
      } catch {
        // user cancelled the native share sheet — no-op
      }
    } else {
      handleCopy();
    }
  };

  const modalTitle = useMemo(() => {
    if (step === 'success') return t('createModal.titleReady', 'Link ready');
    if (targetLabel) return t('createModal.titleWithLabel', 'Share "{{label}}"', { label: targetLabel });
    return t('createModal.titleCreate', 'Create share link');
  }, [step, targetLabel, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      size="md"
      footer={
        step === 'form' ? (
          <>
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSubmit(onSubmit)} loading={isSubmitting}>
              {t('createModal.create', 'Create link')}
            </Button>
          </>
        ) : (
          <Button block onClick={handleClose}>
            {t('createModal.done', 'Done')}
          </Button>
        )
      }
    >
      {step === 'success' && createdShare ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('createModal.successNotice', 'This is the only time the link is shown — copy it now. You can revoke or extend it later from the Shares page.')}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-3">
            <code className="flex-1 min-w-0 truncate text-xs sm:text-sm text-neutral-800 dark:text-neutral-200">
              {createdShare.url}
            </code>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" block onClick={handleCopy}>
              {t('common:actions.copyLink', 'Copy link')}
            </Button>
            <Button variant="outline" block onClick={handleNativeShare}>
              {t('createModal.shareEllipsis', 'Share…')}
            </Button>
          </div>
          {createdShare.hasPassword && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {t('createModal.passwordProtectedNotice', 'This link is password-protected — share the password separately from the link itself.')}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          {showFilePicker && (
            <FormField label={t('createModal.filesLabel', 'Files to share')}>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" value="all" {...register('fileMode')} className="accent-primary-500" />
                  {t('createModal.allFiles', 'All files ({{count}})', { count: files.length })}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" value="specific" {...register('fileMode')} className="accent-primary-500" />
                  {t('createModal.specificFiles', 'Specific files')}
                </label>
                {fileMode === 'specific' && (
                  <div className="ml-6 mt-1 space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {files.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <input
                          type="checkbox"
                          className="accent-primary-500"
                          checked={selectedFileIds.includes(f.id)}
                          onChange={() => toggleFile(f.id)}
                        />
                        {f.label || t('createModal.untitledFile', 'Untitled file')}
                      </label>
                    ))}
                    {errors.fileIds && <p className="text-xs text-red-600 dark:text-red-400">{fieldError(t, errors.fileIds.message)}</p>}
                  </div>
                )}
              </div>
            </FormField>
          )}

          <FormField label={t('createModal.expiresLabel', 'Link expires')}>
            <div className="grid grid-cols-3 gap-2">
              {EXPIRY_OPTIONS.map((opt) => {
                const disabled = includeSensitive && !SENSITIVE_ALLOWED_EXPIRY.has(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm cursor-pointer transition-colors ${
                      disabled
                        ? 'opacity-40 cursor-not-allowed border-neutral-200 dark:border-neutral-700'
                        : 'border-neutral-200 dark:border-neutral-700 hover:border-primary-400 has-[:checked]:border-primary-500 has-[:checked]:bg-primary-50 dark:has-[:checked]:bg-primary-900/20'
                    }`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      disabled={disabled}
                      {...register('expiresIn')}
                      className="accent-primary-500"
                    />
                    {t(`expiryOptions.${opt.value}`, opt.label)}
                  </label>
                );
              })}
            </div>
            {errors.expiresIn && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldError(t, errors.expiresIn.message)}</p>}
          </FormField>

          <Switch
            label={t('createModal.allowDownloadLabel', 'Allow download')}
            description={t('createModal.allowDownloadDescription', 'Off shows a preview-only link.')}
            {...register('allowDownload')}
          />

          <Input
            label={t('createModal.passwordLabel', 'Password (optional)')}
            type="text"
            placeholder={
              includeSensitive
                ? t('createModal.passwordPlaceholderSensitive', 'Required — sensitive fields are included')
                : t('createModal.passwordPlaceholderDefault', 'Leave blank for no password')
            }
            error={fieldError(t, errors.password?.message)}
            {...register('password')}
          />

          <Input
            label={t('createModal.labelLabel', 'Label (optional)')}
            placeholder={t('createModal.labelPlaceholder', 'e.g. For bank KYC')}
            error={fieldError(t, errors.label?.message)}
            {...register('label')}
          />

          {targetType !== 'folder' && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
              <Switch label={t('createModal.includeSensitiveLabel', 'Include sensitive fields (passwords etc.)')} {...register('includeSensitive')} />
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                {t(
                  'createModal.includeSensitiveDescription',
                  'Off by default. When on, anyone with the link and password can see saved passwords/secret values in plain text — a password becomes required and the link can expire in at most 24 hours.',
                )}
              </p>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
