import { useRef } from 'react';
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
    if (ok) toast.success(t('members:invite.copied', 'Link copied — now paste it in a message'));
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
      {invite?.emailSent ? (
        <p className="rounded-xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          {t('members:invite.emailSentNotice', 'We emailed the invite to {{email}}. You can also send them the link yourself.', { email })}
        </p>
      ) : (
        <p className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          {t('members:invite.emailNotSentNotice', "Email couldn't be sent — copy the link below and send it yourself.")}
        </p>
      )}

      <div>
        <label htmlFor="invite-link" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
          {t('members:invite.linkLabel', 'Invite link for {{name}}', { name })}
        </label>
        <input
          id="invite-link"
          ref={inputRef}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full px-3 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-lg text-sm text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-900"
        />
        {invite?.expiresAt && (
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            {t('members:invite.expiresNotice', 'This link works until {{date}}.', { date: formatDate(invite.expiresAt) })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2">
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
        <Button variant="secondary" block onClick={handleCopy}>
          {t('members:invite.copy', 'Copy link')}
        </Button>
        {canNativeShare && (
          <Button variant="outline" block onClick={handleNativeShare}>
            {t('members:invite.moreWays', 'More ways to share…')}
          </Button>
        )}
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t('members:invite.newLinkNotice', 'Getting the link again later makes a new one — older invite links stop working.')}
      </p>
    </div>
  );
}
