import { useRef, useState, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import { formatDate } from '@/i18n/formatters.js';
import { copyText, WhatsAppIcon } from '@/features/share/shareLinkUtils.jsx';

/**
 * InviteSharePanel — the "share invite" step shown right after adding a
 * member, and again from a pending member's "Share invite link" action.
 * The invite email is sent automatically, but email can be off, slow or land
 * in spam, so the admin always gets the link here too: one-tap Copy,
 * WhatsApp (wa.me with a prefilled message) and the phone's own share sheet
 * (navigator.share) when the browser has one.
 *
 * Props: name (invitee), email, familyName, invite: { url, expiresAt, emailSent }.
 */
export default function InviteSharePanel({ name, email, familyName, invite }) {
  const { t } = useTranslation(['members', 'common']);
  const inputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  const url = invite?.url || '';
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const message = t('members:invite.shareMessage', "Hi {{name}}! You're invited to join {{family}} on Family Vault. Tap this link to join: {{url}}", {
    name: name || '',
    family: familyName || t('members:invite.ourFamily', 'our family'),
    url,
  });
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const handleCopy = async () => {
    const ok = await copyText(url, inputRef.current);
    if (ok) {
      toast.success(t('members:invite.copied', 'Link copied'));
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }
    else toast.error(t('members:invite.copyFailed', 'Could not copy. Press and hold the link above to copy it.'));
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: t('members:invite.shareTitle', 'Join our family on Family Vault'), text: message });
    } catch {
      // user closed the share sheet — nothing to do
    }
  };

  return (
    <div className="space-y-4">
      {invite?.emailSent === true ? (
        <p className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          {t('members:invite.emailSentNotice', 'We emailed the invite to {{email}}.', { email })}
        </p>
      ) : (
        <p className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {t('members:invite.emailNotSentNotice', 'We could not send an email — please share the link below yourself.')}
        </p>
      )}

      <div>
        <label htmlFor="invite-link" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          {t('members:invite.linkLabel', 'Invite link')}
        </label>
        <div className="relative">
          <input
            id="invite-link"
            ref={inputRef}
            type="text"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="w-full min-h-[44px] pl-3 pr-14 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? t('members:invite.copied', 'Link copied') : t('members:invite.copy', 'Copy link')}
            className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center rounded-r-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white"
          >
            {copied ? <Check className="w-5 h-5 text-green-600 dark:text-green-400" aria-hidden="true" /> : <Copy className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400" aria-live="polite">
          {copied
            ? t('members:invite.copied', 'Link copied')
            : invite?.expiresAt
              ? t('members:invite.expiresNotice', 'This link works until {{date}}', { date: formatDate(invite.expiresAt) })
              : ''}
        </p>
      </div>

      <Button
        as="a"
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        variant="bare"
        block
        className="bg-[#25D366] hover:bg-[#1ebe5b] text-white"
        leftIcon={<WhatsAppIcon className="w-4 h-4" />}
      >
        {t('members:invite.whatsapp', 'Share on WhatsApp')}
      </Button>

      {canNativeShare && (
        <div className="text-center">
          <button
            type="button"
            onClick={handleNativeShare}
            className="min-h-[44px] px-3 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('members:invite.more', 'More')}
          </button>
        </div>
      )}

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t('members:invite.newLinkNotice', 'Getting the link again later creates a new one — older links stop working.')}
      </p>
    </div>
  );
}
