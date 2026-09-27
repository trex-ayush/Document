import { env } from '../config/env.js';

/**
 * Branded HTML email templates + plain-text fallbacks, in English and Hindi. Every function
 * returns `{ subject, html, text }`, ready to hand straight to `mailer.js`'s `sendMail()`, and
 * takes `lang` ('en' | 'hi'; anything else = English) — the recipient's own app language
 * (`User.language`), so a parent who uses the app in Hindi also gets Hindi email.
 *
 * Rules:
 *  - Coral brand colour (#ff5a5f), single column, mobile-friendly.
 *  - NEVER put a secret, password, sensitive field value, or file content in an email — always
 *    link back into the app (`${env.CLIENT_URL}/...`) instead.
 *  - Say who did what, in which family, and what to do if it looks wrong. Plain words.
 *  - Every template also returns a plain-text version (some mail clients/screen readers use it).
 */

const BRAND = '#ff5a5f';
const BRAND_DARK = '#e64349';

// Logo images live in the client app's public/assets (served alongside the SPA), so the same
// CLIENT_URL used for every in-app link also builds their absolute URL. Email clients need an
// absolute, publicly reachable URL — a relative path won't resolve inside an email.
// One logo for every client: it carries its own opaque white rounded background baked into the
// PNG. Gmail's dark mode ignores `prefers-color-scheme` image swaps and darkens the email
// background instead, which made the dark "Family" wordmark on a transparent logo invisible.
// Email clients don't recolor image pixels, so a self-contained white badge stays readable.
const LOGO_URL = `${env.CLIENT_URL}/assets/email-logo.png`;
// Source asset is 536x236 (~3x the display size, crisp on high-density screens).
const LOGO_WIDTH = 170;
const LOGO_HEIGHT = 75;

const url = (path) => `${env.CLIENT_URL}${path}`;
const isHi = (lang) => lang === 'hi';
/** Picks the English or Hindi version of a piece of text. */
const tr = (lang, en, hi) => (isHi(lang) ? hi : en);

// ---------- shared words ----------

const COMMON = {
  en: {
    open: 'Open Family Vault',
    member: 'A member',
    someone: 'Someone',
    footerMember: "You're getting this because you have a Family Vault account.",
    footerAdmin: "You're getting this because you're an admin of this family on Family Vault. To choose which alerts you get, open Settings → Family → Notifications.",
    footerPlatform: "You're getting this because you're an admin of the Family Vault app.",
    linkHelp: "If the button doesn't work, copy this link into your browser:",
    viewActivity: 'See activity',
    seeMembers: 'See members',
  },
  hi: {
    open: 'Family Vault खोलें',
    member: 'एक सदस्य',
    someone: 'किसी',
    footerMember: 'यह ईमेल आपको इसलिए मिला क्योंकि आपका Family Vault पर खाता है।',
    footerAdmin: 'यह ईमेल आपको इसलिए मिला क्योंकि आप Family Vault पर इस परिवार के एडमिन हैं। कौन-से अलर्ट मिलें, यह सेटिंग्स → परिवार → सूचनाएँ में चुनें।',
    footerPlatform: 'यह ईमेल आपको इसलिए मिला क्योंकि आप Family Vault ऐप के एडमिन हैं।',
    linkHelp: 'अगर बटन काम न करे, तो यह लिंक कॉपी करके ब्राउज़र में खोलें:',
    viewActivity: 'गतिविधि देखें',
    seeMembers: 'सदस्य देखें',
  },
};
const common = (lang) => (isHi(lang) ? COMMON.hi : COMMON.en);

/** What a member's access means, in plain words. */
function accessWords(access, lang) {
  if (access === 'read') return tr(lang, 'can only view', 'सिर्फ़ देख सकते हैं');
  return tr(lang, 'can view and add', 'देख और जोड़ सकते हैं');
}

/** "Sat, 26 Sep 2026, 7:12 pm IST" — times read in Indian time, not GMT. */
function formatIndianTime(time, lang) {
  const d = time ? new Date(time) : new Date();
  const text = new Intl.DateTimeFormat(isHi(lang) ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${text} IST`;
}

/** "3 Oct 2026" — a date without the time. */
function formatIndianDate(time, lang) {
  return new Intl.DateTimeFormat(isHi(lang) ? 'hi-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(time));
}

// ---------- layout ----------

function baseLayout({ lang, preheader = '', heading, bodyHtml, ctaText, ctaUrl, footerNote }) {
  const c = common(lang);
  const cta = ctaUrl
    ? `<tr><td align="center" style="padding: 8px 28px 8px;">
         <a href="${ctaUrl}" style="background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;
           font-size:15px;padding:12px 28px;border-radius:8px;display:inline-block;">${ctaText || c.open}</a>
       </td></tr>
       <tr><td align="center" style="padding:10px 28px 0;">
         <p style="margin:0 0 4px;font-size:12px;color:#8a8a8a;">${c.linkHelp}</p>
         <p style="margin:0;font-size:12px;color:#8a8a8a;word-break:break-all;">${ctaUrl}</p>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="${isHi(lang) ? 'hi' : 'en'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Family Vault</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Noto Sans Devanagari',sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td align="center" style="background:#ffffff;padding:24px 28px 0;">
                <img
                  src="${LOGO_URL}"
                  width="${LOGO_WIDTH}"
                  height="${LOGO_HEIGHT}"
                  alt="Family Vault"
                  style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;"
                />
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;"><div style="height:4px;border-radius:4px;margin-top:18px;background:linear-gradient(90deg, ${BRAND}, ${BRAND_DARK});"></div></td>
            </tr>
            <tr>
              <td style="padding:24px 28px 20px;">
                <h1 style="margin:0 0 14px;font-size:19px;line-height:1.4;color:#1a1a1a;">${heading}</h1>
                <div style="font-size:14px;line-height:1.65;color:#3d3d3d;">${bodyHtml}</div>
              </td>
            </tr>
            ${cta}
            <tr>
              <td style="padding:22px 28px 26px;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#9a9a9a;border-top:1px solid #eeeeee;padding-top:16px;">${escapeHtml(footerNote || c.footerMember)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function textLayout({ heading, lines = [], ctaUrl, footerNote }) {
  const body = [`Family Vault — ${heading}`, '', ...lines.filter((l) => l !== null && l !== undefined)];
  if (ctaUrl) body.push('', ctaUrl);
  if (footerNote) body.push('', '—', footerNote);
  return body.join('\n');
}

/** `<p>` for each paragraph; paragraphs are already-escaped HTML strings. */
const paras = (list) => list.filter(Boolean).map((p) => `<p style="margin:0 0 12px;">${p}</p>`).join('');
/** Label: value rows. Values are escaped here. */
const detailsHtml = (rows) =>
  `<ul style="margin:4px 0 14px;padding-left:18px;">${rows.map(([k, v]) => `<li>${k}: ${escapeHtml(v)}</li>`).join('')}</ul>`;
const bulletsHtml = (items) =>
  `<ul style="margin:4px 0 14px;padding-left:18px;">${items.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`;

/** Builds one email from the same pieces for HTML and plain text. */
function build({ lang, subject, heading, paragraphs, textParagraphs, extraHtml = '', extraText = [], ctaText, ctaUrl, footerNote }) {
  return {
    subject,
    html: baseLayout({ lang, preheader: textParagraphs[0] || heading, heading: escapeHtml(heading), bodyHtml: paras(paragraphs) + extraHtml, ctaText, ctaUrl, footerNote }),
    text: textLayout({ heading, lines: [...textParagraphs, ...extraText], ctaUrl, footerNote }),
  };
}

// ---------- Password reset ----------

export function passwordResetEmail({ name, resetUrl, expiresInMinutes = 30, lang }) {
  const hi = isHi(lang);
  const greetText = name ? tr(lang, `Hi ${name},`, `नमस्ते ${name},`) : tr(lang, 'Hi,', 'नमस्ते,');
  const t = [
    greetText,
    tr(
      lang,
      `We got a request to reset the password of your Family Vault account. Tap the button below to choose a new one. The link works only once and stops working after ${expiresInMinutes} minutes.`,
      `आपके Family Vault खाते का पासवर्ड बदलने की रिक्वेस्ट आई है। नया पासवर्ड बनाने के लिए नीचे दिया बटन दबाएँ। यह लिंक सिर्फ़ एक बार चलेगा और ${expiresInMinutes} मिनट बाद बंद हो जाएगा।`,
    ),
    tr(lang, "Didn't ask for this? Just ignore this email — your password stays the same.", 'आपने यह नहीं माँगा? तो इस ईमेल को छोड़ दें — आपका पासवर्ड नहीं बदलेगा।'),
  ];
  return build({
    lang,
    subject: tr(lang, 'Reset your Family Vault password', 'अपना Family Vault पासवर्ड बदलें'),
    heading: tr(lang, 'Reset your password', 'नया पासवर्ड बनाएँ'),
    paragraphs: [escapeHtml(t[0]), escapeHtml(t[1]), hi ? escapeHtml(t[2]) : `<strong>Didn't ask for this?</strong> Just ignore this email — your password stays the same.`],
    textParagraphs: t,
    ctaText: tr(lang, 'Choose a new password', 'नया पासवर्ड बनाएँ'),
    ctaUrl: resetUrl,
  });
}

export function passwordChangedEmail({ name, time, lang }) {
  const when = formatIndianTime(time, lang);
  const greetText = name ? tr(lang, `Hi ${name},`, `नमस्ते ${name},`) : tr(lang, 'Hi,', 'नमस्ते,');
  const resetLink = url('/forgot-password');
  const t = [
    greetText,
    tr(
      lang,
      `The password of your Family Vault account was changed on ${when}. For safety, you've been signed out on every device — sign in again with the new password.`,
      `आपके Family Vault खाते का पासवर्ड ${when} को बदला गया। सुरक्षा के लिए आप सभी डिवाइस से साइन आउट हो गए हैं — नए पासवर्ड से फिर से साइन इन करें।`,
    ),
    tr(lang, 'If this was you, nothing else to do.', 'अगर यह आपने किया है, तो और कुछ करने की ज़रूरत नहीं।'),
    tr(
      lang,
      `Wasn't you? Set a new password right away at ${resetLink} and tell your family admin.`,
      `यह आपने नहीं किया? तुरंत ${resetLink} पर नया पासवर्ड बनाएँ और परिवार के एडमिन को बताएँ।`,
    ),
  ];
  const notYouHtml = tr(
    lang,
    `<strong>Wasn't you?</strong> <a href="${resetLink}" style="color:${BRAND_DARK};">Set a new password right away</a> and tell your family admin.`,
    `<strong>यह आपने नहीं किया?</strong> <a href="${resetLink}" style="color:${BRAND_DARK};">तुरंत नया पासवर्ड बनाएँ</a> और परिवार के एडमिन को बताएँ।`,
  );
  return build({
    lang,
    subject: tr(lang, 'Your Family Vault password was changed', 'आपका Family Vault पासवर्ड बदला गया'),
    heading: tr(lang, 'Your password was changed', 'आपका पासवर्ड बदला गया'),
    paragraphs: [escapeHtml(t[0]), escapeHtml(t[1]), escapeHtml(t[2]), notYouHtml],
    textParagraphs: t,
    ctaText: tr(lang, 'Sign in', 'साइन इन करें'),
    ctaUrl: url('/login'),
  });
}

// ---------- Member invites ----------

export function memberInviteEmail({ familyName, inviterName, acceptUrl, toEmail, access, expiresAt, lang }) {
  const inviter = inviterName || tr(lang, 'A family member', 'परिवार के एक सदस्य');
  const family = familyName || tr(lang, 'your family', 'आपके परिवार');
  const until = expiresAt ? formatIndianDate(expiresAt, lang) : null;
  const who = toEmail ? ` (${toEmail})` : '';
  const t = [
    tr(
      lang,
      `${inviter} has invited you${who} to join ${family} on Family Vault — one safe place for your family's documents, ID cards and passwords.`,
      `${inviter} ने आपको${who} Family Vault पर ${family} में जुड़ने का न्योता भेजा है — परिवार के दस्तावेज़, पहचान पत्र और पासवर्ड रखने की एक सुरक्षित जगह।`,
    ),
    access ? tr(lang, `After joining, you ${accessWords(access, lang)}.`, `जुड़ने के बाद आप ${accessWords(access, lang)}।`) : null,
    tr(
      lang,
      `Tap the button below to create your password and join.${until ? ` The invite works until ${until}.` : ''}`,
      `अपना पासवर्ड बनाकर जुड़ने के लिए नीचे दिया बटन दबाएँ।${until ? ` यह न्योता ${until} तक चलेगा।` : ''}`,
    ),
    tr(lang, "Weren't expecting this? You can ignore this email.", 'आपको इसकी उम्मीद नहीं थी? तो इस ईमेल को छोड़ दें।'),
  ].filter(Boolean);
  return build({
    lang,
    subject: tr(lang, `${inviter} invited you to ${family} on Family Vault`, `${inviter} ने आपको Family Vault पर ${family} में जुड़ने का न्योता भेजा है`),
    heading: tr(lang, `You're invited to ${family}`, `${family} से जुड़ने का न्योता`),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: tr(lang, 'Join the family', 'परिवार से जुड़ें'),
    ctaUrl: acceptUrl,
    // They have no account yet, so not the usual "you have an account" footer.
    footerNote: tr(
      lang,
      `You're getting this because ${inviter} invited this email address to Family Vault.`,
      `यह ईमेल आपको इसलिए मिला क्योंकि ${inviter} ने इस ईमेल पते को Family Vault पर न्योता भेजा है।`,
    ),
  });
}

export function inviteAcceptedEmail({ familyName, memberName, memberEmail, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const who = memberEmail ? `${name} (${memberEmail})` : name;
  const t = [
    tr(
      lang,
      `${who} accepted the invite and can now sign in to ${familyName} on Family Vault.`,
      `${who} ने न्योता मान लिया है और अब Family Vault पर ${familyName} में साइन इन कर सकते हैं।`,
    ),
    tr(lang, "Didn't expect this? Open Members to check their access or remove them.", 'आपको इसकी उम्मीद नहीं थी? सदस्य पेज पर उनकी अनुमति देखें या उन्हें हटा दें।'),
  ];
  return build({
    lang,
    subject: tr(lang, `${name} accepted the invite to ${familyName}`, `${name} ${familyName} से जुड़ गए`),
    heading: tr(lang, `${name} has joined`, `${name} जुड़ गए हैं`),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

// ---------- Security ----------

/**
 * Admin-facing alert: one of the "instant admin alert" events, sent to the family's admins, not
 * to the member who signed in. `memberName` is whose account signed in.
 */
export function newDeviceLoginEmail({ recipientName, memberName, familyName, device, os, browser, ip, time, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const when = formatIndianTime(time, lang);
  const unknown = tr(lang, 'Unknown', 'पता नहीं');
  const rows = [
    [tr(lang, 'Device', 'डिवाइस'), device || unknown],
    [tr(lang, 'System', 'सिस्टम'), os || unknown],
    [tr(lang, 'Browser', 'ब्राउज़र'), browser || unknown],
    [tr(lang, 'IP address', 'IP पता'), ip || unknown],
    [tr(lang, 'Time', 'समय'), when],
  ];
  const greetText = recipientName ? tr(lang, `Hi ${recipientName},`, `नमस्ते ${recipientName},`) : null;
  const t = [
    greetText,
    tr(
      lang,
      `${name}'s account just signed in${familyName ? ` to ${familyName}` : ''} from a phone or computer we haven't seen on this account before:`,
      `${name} के खाते में${familyName ? ` ${familyName} के लिए` : ''} अभी एक ऐसे फ़ोन या कंप्यूटर से साइन इन हुआ है, जो इस खाते पर पहले नहीं दिखा:`,
    ),
  ].filter(Boolean);
  const after = [
    tr(lang, 'If this was them, nothing to do.', 'अगर यह वही थे, तो कुछ करने की ज़रूरत नहीं।'),
    tr(
      lang,
      'Not them? Open Members in Family Vault and turn off or remove their access right away.',
      'यह वे नहीं थे? Family Vault में सदस्य पेज खोलें और तुरंत उनकी पहुँच बंद करें या उन्हें हटा दें।',
    ),
  ];
  return {
    subject: tr(lang, `[Family Vault] New device sign-in — ${name}`, `[Family Vault] नए डिवाइस से साइन इन — ${name}`),
    html: baseLayout({
      lang,
      preheader: t[t.length - 1],
      heading: escapeHtml(tr(lang, 'New sign-in from an unrecognized device', 'नए डिवाइस से साइन इन')),
      bodyHtml:
        paras(t.map(escapeHtml)) +
        detailsHtml(rows) +
        paras([
          escapeHtml(after[0]),
          tr(
            lang,
            '<strong>Not them?</strong> Open Members in Family Vault and turn off or remove their access right away.',
            '<strong>यह वे नहीं थे?</strong> Family Vault में सदस्य पेज खोलें और तुरंत उनकी पहुँच बंद करें या उन्हें हटा दें।',
          ),
        ]),
      ctaText: c.seeMembers,
      ctaUrl: url('/members'),
      footerNote: c.footerAdmin,
    }),
    text: textLayout({
      heading: tr(lang, 'New sign-in from an unrecognized device', 'नए डिवाइस से साइन इन'),
      lines: [...t, ...rows.map(([k, v]) => `${k}: ${v}`), '', ...after],
      ctaUrl: url('/members'),
      footerNote: c.footerAdmin,
    }),
  };
}

export function failedLoginsEmail({ familyName, memberName, memberEmail, attempts = 5, minutes = 15, time, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const who = memberEmail ? `${name} (${memberEmail})` : name;
  const t = [
    tr(
      lang,
      `There were ${attempts} wrong password attempts on the account of ${who} within ${minutes} minutes (last one ${formatIndianTime(time, lang)}).`,
      `${who} के खाते पर ${minutes} मिनट में ${attempts} बार गलत पासवर्ड डाला गया (आख़िरी बार ${formatIndianTime(time, lang)})।`,
    ),
    tr(
      lang,
      "If it was them forgetting the password, they can use \"Forgot password?\" on the sign-in page. If it wasn't them, ask them to change their password, or turn off their access in Members.",
      'अगर वे पासवर्ड भूल गए थे, तो साइन-इन पेज पर "पासवर्ड भूल गए?" से नया बना सकते हैं। अगर यह वे नहीं थे, तो उनसे पासवर्ड बदलने को कहें या सदस्य पेज पर उनकी पहुँच बंद करें।',
    ),
  ];
  return build({
    lang,
    subject: tr(lang, `[${familyName}] Repeated failed sign-in attempts — ${name}`, `[${familyName}] बार-बार गलत पासवर्ड — ${name}`),
    heading: tr(lang, 'Repeated failed sign-in attempts', 'बार-बार गलत पासवर्ड डाला गया'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

// ---------- Member alerts (to the family's admins) ----------

export function memberAddedEmail({ familyName, memberName, memberEmail, access, byName, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const who = memberEmail ? `${name} (${memberEmail})` : name;
  const t = [
    byName
      ? tr(lang, `${byName} added ${who} to ${familyName}.`, `${byName} ने ${who} को ${familyName} में जोड़ा।`)
      : tr(lang, `${who} was added to ${familyName}.`, `${who} को ${familyName} में जोड़ा गया।`),
    access ? tr(lang, `They ${accessWords(access, lang)}.`, `वे ${accessWords(access, lang)}।`) : null,
    tr(lang, "Didn't expect this? Open Members to change their access or remove them.", 'आपको इसकी उम्मीद नहीं थी? सदस्य पेज पर उनकी अनुमति बदलें या उन्हें हटा दें।'),
  ].filter(Boolean);
  return build({
    lang,
    subject: tr(lang, `[${familyName}] New member added — ${name}`, `[${familyName}] नया सदस्य जोड़ा गया — ${name}`),
    heading: tr(lang, 'New member added', 'नया सदस्य जोड़ा गया'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

export function memberRemovedEmail({ familyName, memberName, byName, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const t = [
    byName
      ? tr(lang, `${byName} removed ${name} from ${familyName}.`, `${byName} ने ${name} को ${familyName} से हटा दिया।`)
      : tr(lang, `${name} was removed from ${familyName}.`, `${name} को ${familyName} से हटा दिया गया।`),
    tr(
      lang,
      "They can no longer open the family's documents. Everything they added stays in the vault.",
      'अब वे परिवार के दस्तावेज़ नहीं खोल सकते। उन्होंने जो कुछ जोड़ा था, वह सब वॉल्ट में ही रहेगा।',
    ),
  ];
  return build({
    lang,
    subject: tr(lang, `[${familyName}] Member removed — ${name}`, `[${familyName}] सदस्य हटाया गया — ${name}`),
    heading: tr(lang, 'Member removed', 'सदस्य हटाया गया'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

export function memberDisabledEmail({ familyName, memberName, byName, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  const t = [
    byName
      ? tr(lang, `${byName} turned off ${name}'s access to ${familyName}.`, `${byName} ने ${familyName} में ${name} की पहुँच बंद कर दी।`)
      : tr(lang, `${name}'s access to ${familyName} was turned off.`, `${familyName} में ${name} की पहुँच बंद कर दी गई।`),
    tr(
      lang,
      'They were signed out of every device and can’t open the vault until their access is turned back on in Members.',
      'वे सभी डिवाइस से साइन आउट हो गए हैं और जब तक सदस्य पेज पर उनकी पहुँच फिर से चालू न हो, वॉल्ट नहीं खोल सकते।',
    ),
  ];
  return build({
    lang,
    subject: tr(lang, `[${familyName}] Member disabled — ${name}`, `[${familyName}] सदस्य की पहुँच बंद — ${name}`),
    heading: tr(lang, 'Member access turned off', 'सदस्य की पहुँच बंद'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

/** `role` set = the member was made (or stopped being) a family admin; otherwise `access` changed. */
export function memberAccessChangedEmail({ familyName, memberName, access, role, byName, lang }) {
  const c = common(lang);
  const name = memberName || c.member;
  let what;
  if (role === 'admin') {
    what = tr(lang, `${name} is now a family admin: they can also invite and manage members.`, `${name} अब परिवार के एडमिन हैं: वे सदस्यों को जोड़ और सँभाल भी सकते हैं।`);
  } else if (role === 'member') {
    what = tr(lang, `${name} is no longer a family admin. They ${accessWords(access, lang)}.`, `${name} अब परिवार के एडमिन नहीं हैं। वे ${accessWords(access, lang)}।`);
  } else {
    what = tr(lang, `${name} now ${accessWords(access, lang)}.`, `${name} अब ${accessWords(access, lang)}।`);
  }
  const t = [
    byName ? tr(lang, `${byName} changed ${name}'s access in ${familyName}.`, `${byName} ने ${familyName} में ${name} की अनुमति बदली।`) : null,
    what,
  ].filter(Boolean);
  return build({
    lang,
    subject: tr(lang, `[${familyName}] Member access changed — ${name}`, `[${familyName}] सदस्य की अनुमति बदली — ${name}`),
    heading: tr(lang, 'Member access changed', 'सदस्य की अनुमति बदली'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: c.seeMembers,
    ctaUrl: url('/members'),
    footerNote: c.footerAdmin,
  });
}

// ---------- Deletes (to the family's admins) ----------

/** `items`: [{ kind: 'document' | 'folder', label }]. `binDays`: how long the Bin keeps them (null = until emptied). */
export function itemsDeletedEmail({ familyName, items, byName, binDays, lang }) {
  const c = common(lang);
  const docs = items.filter((i) => i.kind === 'document').length;
  const folders = items.filter((i) => i.kind === 'folder').length;
  const count = (n, one, many, hiWord) => (isHi(lang) ? `${n} ${hiWord}` : `${n} ${n === 1 ? one : many}`);
  const parts = [];
  if (docs) parts.push(count(docs, 'document', 'documents', 'दस्तावेज़'));
  if (folders) parts.push(count(folders, 'folder', 'folders', 'फ़ोल्डर'));
  const what = parts.join(tr(lang, ' and ', ' और '));
  const t = [
    tr(
      lang,
      `${what} ${items.length === 1 ? 'was' : 'were'} deleted${byName ? ` by ${byName}` : ''} in ${familyName}:`,
      `${familyName} में ${byName ? `${byName} ने ` : ''}${what} मिटाए:`,
    ),
  ];
  const list = items.slice(0, 20).map((i) => `${i.kind === 'folder' ? tr(lang, 'Folder', 'फ़ोल्डर') : tr(lang, 'Document', 'दस्तावेज़')}: ${i.label}`);
  if (items.length > 20) list.push(tr(lang, `…and ${items.length - 20} more`, `…और ${items.length - 20}`));
  const after = [
    binDays
      ? tr(lang, `They're in the Bin for ${binDays} days and can be restored from there.`, `ये ${binDays} दिन तक बिन में रहेंगे और वहाँ से वापस लाए जा सकते हैं।`)
      : tr(lang, "They're in the Bin and can be restored from there.", 'ये बिन में हैं और वहाँ से वापस लाए जा सकते हैं।'),
  ];
  return build({
    lang,
    subject: tr(lang, `[${familyName}] Items deleted${byName ? ` by ${byName}` : ''}`, `[${familyName}] चीज़ें मिटाई गईं${byName ? ` — ${byName}` : ''}`),
    heading: tr(lang, 'Items deleted', 'चीज़ें मिटाई गईं'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    extraHtml: bulletsHtml(list) + paras(after.map(escapeHtml)),
    extraText: [...list, '', ...after],
    ctaText: tr(lang, 'Open the Bin', 'बिन खोलें'),
    ctaUrl: url('/bin'),
    footerNote: c.footerAdmin,
  });
}

// ---------- Storage (to the app's admins) ----------

export function storageWarningEmail({ familyName, usedMb, limitMb, threshold, lang }) {
  const c = common(lang);
  const t = [
    tr(
      lang,
      `${familyName} has stored ${usedMb} MB — ${threshold}% or more of the ${limitMb} MB warning size set in the admin panel. Nothing is blocked; this is only a heads-up.`,
      `${familyName} ने ${usedMb} MB जगह इस्तेमाल कर ली है — एडमिन पैनल में तय ${limitMb} MB चेतावनी सीमा का ${threshold}% या उससे ज़्यादा। कुछ भी रोका नहीं गया है; यह सिर्फ़ जानकारी के लिए है।`,
    ),
    tr(
      lang,
      'You can see how much each family uses in Admin → Families, and change the warning size in Admin → Settings.',
      'हर परिवार कितनी जगह ले रहा है, यह एडमिन → परिवार में देखें; चेतावनी सीमा एडमिन → सेटिंग्स में बदलें।',
    ),
  ];
  return build({
    lang,
    subject: tr(lang, `${familyName} has used ${threshold}% of the storage warning size`, `${familyName} ने स्टोरेज चेतावनी सीमा का ${threshold}% इस्तेमाल किया`),
    heading: tr(lang, `${familyName} is using ${threshold}% of its space`, `${familyName} ने ${threshold}% जगह ले ली है`),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
    ctaText: tr(lang, 'Open the admin panel', 'एडमिन पैनल खोलें'),
    ctaUrl: url('/admin/families'),
    footerNote: c.footerPlatform,
  });
}

// ---------- Generic admin alert (kept for callers that build their own text) ----------

/** `detailsList` is an array of plain strings (already-safe, non-sensitive summary lines). */
export function adminAlertEmail({ familyName, eventTitle, eventDescription, detailsList = [], lang }) {
  const c = common(lang);
  return build({
    lang,
    subject: `[${familyName}] ${eventTitle}`,
    heading: eventTitle,
    paragraphs: [escapeHtml(eventDescription)],
    textParagraphs: [eventDescription],
    extraHtml: detailsList.length ? bulletsHtml(detailsList) : '',
    extraText: detailsList,
    ctaText: c.viewActivity,
    ctaUrl: url('/activity'),
    footerNote: c.footerAdmin,
  });
}

// ---------- Test email ----------

export function testEmail({ name, lang }) {
  const greetText = name ? tr(lang, `Hi ${name},`, `नमस्ते ${name},`) : tr(lang, 'Hi,', 'नमस्ते,');
  const t = [
    greetText,
    tr(
      lang,
      "This is a test email from Family Vault. If you're reading it, email is working: invites, password resets and alerts will reach people.",
      'यह Family Vault का टेस्ट ईमेल है। अगर आप इसे पढ़ रहे हैं, तो ईमेल ठीक चल रहा है: न्योते, पासवर्ड बदलने के लिंक और अलर्ट लोगों तक पहुँचेंगे।',
    ),
  ];
  return build({
    lang,
    subject: tr(lang, 'Family Vault test email', 'Family Vault टेस्ट ईमेल'),
    heading: tr(lang, 'Email is working', 'ईमेल ठीक चल रहा है'),
    paragraphs: t.map(escapeHtml),
    textParagraphs: t,
  });
}

function escapeHtml(input) {
  return String(input ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
