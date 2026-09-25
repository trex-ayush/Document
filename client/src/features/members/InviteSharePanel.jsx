import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/Button.jsx';
import { formatDate } from '@/i18n/formatters.js';

/** Copies `text`; falls back to selecting the given input + execCommand for older/insecure browsers. */
async function copyText(text, inputEl) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    if (inputEl) {
      inputEl.focus();
      inputEl.select();
      inputEl.setSelectionRange(0, text.length);
      return document.execCommand('copy');
    }
  } catch {
    // ignore
  }
  return false;
}

function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91A9.86 9.86 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.26-8.24a8.2 8.2 0 0 1 8.24 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.8-.22-.09-.39-.13-.55.12-.17.25-.64.8-.78.97-.14.16-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.55-1.34-.76-1.83-.2-.48-.4-.42-.55-.42h-.47a.9.9 0 0 0-.66.31c-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
  );
}

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
          className="w-full min-h-[48px] px-4 py-2.5 border border-neutral-300 dark:border-neutral-600 rounded-xl text-sm text-neutral-900 dark:text-white bg-neutral-50 dark:bg-neutral-900"
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
          size="lg"
          className="min-h-[52px] text-base bg-[#25D366] hover:bg-[#1ebe5b] text-white shadow-soft-sm"
          leftIcon={<WhatsAppIcon className="w-5 h-5" />}
        >
          {t('members:invite.whatsapp', 'Share on WhatsApp')}
        </Button>
        <Button variant="secondary" block size="lg" className="min-h-[52px] text-base" onClick={handleCopy}>
          {t('members:invite.copy', 'Copy link')}
        </Button>
        {canNativeShare && (
          <Button variant="outline" block size="lg" className="min-h-[52px] text-base" onClick={handleNativeShare}>
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
