import { env } from '../config/env.js';

/**
 * Branded HTML email templates + plain-text fallbacks. Every function returns
 * `{ subject, html, text }`, ready to hand straight to `mailer.js`'s `sendMail()`.
 *
 * Rules (see this agent's brief):
 *  - Coral brand color (#ff5a5f), single-column, mobile-friendly.
 *  - NEVER put a secret, password, sensitive field value, or file content in an email — always
 *    link back into the app (`${env.CLIENT_URL}/...`) instead.
 *  - Every template also returns a plain-text version (some mail clients/screen readers use it).
 */

const BRAND = '#ff5a5f';
const BRAND_DARK = '#e64349';

function baseLayout({ preheader = '', heading, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const cta = ctaUrl
    ? `<tr><td align="center" style="padding: 28px 0 8px;">
         <a href="${ctaUrl}" style="background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;
           font-size:15px;padding:12px 28px;border-radius:8px;display:inline-block;">${ctaText || 'Open Family Vault'}</a>
       </td></tr>
       <tr><td align="center" style="padding:4px 0 0;">
         <p style="margin:0;font-size:12px;color:#8a8a8a;word-break:break-all;">${ctaUrl}</p>
       </td></tr>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Family Vault</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg, ${BRAND}, ${BRAND_DARK});padding:24px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">Family Vault</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 14px;font-size:19px;color:#1a1a1a;">${heading}</h1>
                <div style="font-size:14px;line-height:1.6;color:#3d3d3d;">${bodyHtml}</div>
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:20px 28px 26px;">
                <p style="margin:0;font-size:12px;color:#9a9a9a;">${footerNote || "You're receiving this because you're a member of a Family Vault account."}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function textLayout({ heading, lines = [], ctaUrl }) {
  const body = [`Family Vault — ${heading}`, '', ...lines];
  if (ctaUrl) body.push('', ctaUrl);
  return body.join('\n');
}

// ---------- Password reset ----------

export function passwordResetEmail({ name, resetUrl, expiresInMinutes = 30 }) {
  const heading = 'Reset your password';
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return {
    subject: 'Reset your Family Vault password',
    html: baseLayout({
      preheader: 'Reset your Family Vault password',
      heading,
      bodyHtml: `<p>${greeting}</p><p>We received a request to reset your Family Vault password. This link expires in ${expiresInMinutes} minutes and can only be used once.</p><p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
      ctaText: 'Reset password',
      ctaUrl: resetUrl,
    }),
    text: textLayout({
      heading,
      lines: [
        greeting,
        `We received a request to reset your Family Vault password. This link expires in ${expiresInMinutes} minutes and can only be used once.`,
        "If you didn't request this, you can safely ignore this email.",
      ],
      ctaUrl: resetUrl,
    }),
  };
}

export function passwordChangedEmail({ name }) {
  const heading = 'Your password was changed';
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return {
    subject: 'Your Family Vault password was changed',
    html: baseLayout({
      preheader: 'Your password was changed',
      heading,
      bodyHtml: `<p>${greeting}</p><p>Your Family Vault password was just changed and every device has been signed out. If this was you, no action is needed.</p><p><strong>If you didn't make this change</strong>, contact your family admin right away.</p>`,
      ctaText: 'Open Family Vault',
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
    text: textLayout({
      heading,
      lines: [
        greeting,
        'Your Family Vault password was just changed and every device has been signed out.',
        "If you didn't make this change, contact your family admin right away.",
      ],
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
  };
}

// ---------- Member invites ----------

export function memberInviteEmail({ familyName, inviterName, acceptUrl }) {
  const heading = `You're invited to ${escapeHtml(familyName)}'s Family Vault`;
  return {
    subject: `${inviterName || 'A family member'} invited you to Family Vault`,
    html: baseLayout({
      preheader: heading,
      heading,
      bodyHtml: `<p>${escapeHtml(inviterName || 'A family member')} has invited you to join <strong>${escapeHtml(familyName)}</strong>'s Family Vault — a shared place to keep important family documents, passwords, and records safe.</p><p>Click below to set up your account.</p>`,
      ctaText: 'Accept invite',
      ctaUrl: acceptUrl,
    }),
    text: textLayout({
      heading,
      lines: [`${inviterName || 'A family member'} has invited you to join ${familyName}'s Family Vault.`, 'Click the link below to set up your account.'],
      ctaUrl: acceptUrl,
    }),
  };
}

export function inviteAcceptedEmail({ familyName, memberName }) {
  const heading = 'A new member joined your vault';
  return {
    subject: `${memberName} accepted their invite`,
    html: baseLayout({
      preheader: heading,
      heading,
      bodyHtml: `<p><strong>${escapeHtml(memberName)}</strong> has accepted their invite and can now sign in to <strong>${escapeHtml(familyName)}</strong>'s Family Vault.</p>`,
      ctaText: 'View members',
      ctaUrl: `${env.CLIENT_URL}/members`,
    }),
    text: textLayout({
      heading,
      lines: [`${memberName} has accepted their invite and can now sign in to ${familyName}'s Family Vault.`],
      ctaUrl: `${env.CLIENT_URL}/members`,
    }),
  };
}

// ---------- Google account linking ----------

export function googleLinkedEmail({ name }) {
  const heading = 'Google sign-in linked';
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return {
    subject: 'Google sign-in linked to your Family Vault account',
    html: baseLayout({
      preheader: heading,
      heading,
      bodyHtml: `<p>${greeting}</p><p>Your Google account is now linked — you can sign in to Family Vault with either your password or Google from now on.</p>`,
      ctaText: 'Open Family Vault',
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
    text: textLayout({
      heading,
      lines: [greeting, 'Your Google account is now linked to your Family Vault account.'],
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
  };
}

export function googleUnlinkedEmail({ name }) {
  const heading = 'Google sign-in unlinked';
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return {
    subject: 'Google sign-in was unlinked from your Family Vault account',
    html: baseLayout({
      preheader: heading,
      heading,
      bodyHtml: `<p>${greeting}</p><p>Your Google account was just unlinked from Family Vault. If this wasn't you, contact your family admin.</p>`,
      ctaText: 'Open Family Vault',
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
    text: textLayout({
      heading,
      lines: [greeting, "Your Google account was just unlinked from Family Vault. If this wasn't you, contact your family admin."],
      ctaUrl: `${env.CLIENT_URL}/login`,
    }),
  };
}

// ---------- Security ----------

/**
 * Admin-facing alert (see docs/DECISIONS.md-style notes in this agent's final report — this is
 * one of the "instant admin alert" events, sent to admins, not to the member who signed in).
 * `recipientName` is the admin receiving the email; `memberName` is whose account signed in.
 */
export function newDeviceLoginEmail({ recipientName, memberName, device, browser, time }) {
  const heading = 'New sign-in from an unrecognized device';
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : 'Hi,';
  const when = time ? new Date(time).toUTCString() : new Date().toUTCString();
  return {
    subject: `[Family Vault] New device sign-in — ${memberName || 'a member'}`,
    html: baseLayout({
      preheader: heading,
      heading,
      bodyHtml: `<p>${greeting}</p><p><strong>${escapeHtml(memberName || 'A member')}</strong>'s account just signed in from a device/browser we haven't seen on this account before:</p><ul style="margin:8px 0;padding-left:18px;"><li>Device: ${escapeHtml(device || 'Unknown')}</li><li>Browser: ${escapeHtml(browser || 'Unknown')}</li><li>Time: ${escapeHtml(when)}</li></ul><p>If this looks right, no action is needed.</p>`,
      ctaText: 'View activity',
      ctaUrl: `${env.CLIENT_URL}/activity`,
      footerNote: "You're receiving this because you're an admin of this Family Vault account. Manage alert preferences in Settings.",
    }),
    text: textLayout({
      heading,
      lines: [
        greeting,
        `${memberName || 'A member'}'s account just signed in from a device we haven't seen before.`,
        `Device: ${device || 'Unknown'}`,
        `Browser: ${browser || 'Unknown'}`,
        `Time: ${when}`,
      ],
      ctaUrl: `${env.CLIENT_URL}/activity`,
    }),
  };
}

// ---------- Generic admin instant alert ----------

/** `detailsList` is an array of plain strings (already-safe, non-sensitive summary lines). */
export function adminAlertEmail({ familyName, eventTitle, eventDescription, detailsList = [] }) {
  const heading = escapeHtml(eventTitle);
  const items = detailsList.length
    ? `<ul style="margin:10px 0;padding-left:18px;">${detailsList.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
    : '';
  return {
    subject: `[${familyName}] ${eventTitle}`,
    html: baseLayout({
      preheader: eventTitle,
      heading,
      bodyHtml: `<p>${escapeHtml(eventDescription)}</p>${items}`,
      ctaText: 'View activity',
      ctaUrl: `${env.CLIENT_URL}/activity`,
      footerNote: "You're receiving this because you're an admin of this Family Vault account. Manage alert preferences in Settings.",
    }),
    text: textLayout({
      heading,
      lines: [eventDescription, ...detailsList],
      ctaUrl: `${env.CLIENT_URL}/activity`,
    }),
  };
}

// ---------- Test email ----------

export function testEmail({ name }) {
  const heading = 'Test email';
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  return {
    subject: 'Family Vault test email',
    html: baseLayout({
      preheader: 'This is a test email from Family Vault',
      heading,
      bodyHtml: `<p>${greeting}</p><p>This is a test email — if you're reading this, your SMTP settings are working correctly.</p>`,
    }),
    text: textLayout({ heading, lines: [greeting, "This is a test email — if you're reading this, your SMTP settings are working correctly."] }),
  };
}

function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
