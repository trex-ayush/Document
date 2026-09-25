import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { env, isProd, isTest } from '../config/env.js';
import { PlatformSettings } from '../models/PlatformSettings.js';
import { decryptFieldValue } from '../utils/crypto.js';

/**
 * Gmail-SMTP-backed mailer, shared by every email-sending call site (alerts.js, auth's
 * forgot-password/invite flows, the test-email route). Design goals (see docs/DECISIONS.md
 * "Email & notifications" / this agent's final report):
 *
 *  - SMTP config is resolved DB-first, env-fallback (`getEffectiveSmtpConfig()` below) — an admin
 *    can set/override host/port/secure/user/mailFrom/password from the Platform Settings panel
 *    (`PlatformSettings.smtp`, `GET/PATCH /platform-settings`) without touching env vars or
 *    redeploying; any field left unset there falls back to the matching `env.SMTP_*` var, same
 *    "null = fallback to env" convention as `getEffectiveFamilySettings()`.
 *  - No effective host at all (DB unset AND env unset) -> email is disabled entirely. In
 *    development we log the subject + the first link found in the message instead of sending, so
 *    the forgot-password/invite flows are still usable end-to-end on a laptop with no SMTP
 *    configured. In production we silently no-op (never crash, never spam prod logs with "email
 *    disabled" on every single activity).
 *  - `sendMail()` NEVER throws and NEVER makes the caller wait for the network round trip to
 *    Gmail — every call site fires it without awaiting (or awaits a promise that always
 *    resolves). Internally, jobs go through a small in-memory FIFO queue processed one at a time,
 *    each with up to 3 attempts and a short exponential backoff between attempts.
 *  - On failure (all attempts exhausted), we log the subject + recipient only — NEVER the email
 *    body, which may reference sensitive context.
 */

const MAX_ATTEMPTS = 3;
// Two backoff waits between three attempts. Kept short under NODE_ENV=test so retry tests don't
// slow the suite down; production gets a more forgiving spread for transient Gmail hiccups.
const RETRY_DELAYS_MS = isTest ? [10, 20] : [1000, 4000];

function extractPrimaryLink(...candidates) {
  for (const candidate of candidates) {
    const match = String(candidate || '').match(/https?:\/\/\S+/);
    if (match) return match[0];
  }
  return null;
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ---------- Effective SMTP config (DB override, env fallback) ----------

/**
 * Raw `PlatformSettings.smtp` subdocument, or `null` when there's no DB connection to read from
 * (e.g. `tests/mailer.test.js`/`mailer-disabled.test.js` exercise this module in isolation with
 * no Mongo connected at all — a `readyState` check here avoids Mongoose's default ~10s query
 * buffering timeout in that case) or the row simply doesn't have one set yet. Never throws.
 */
async function loadPlatformSmtp() {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const settings = await PlatformSettings.findById('platform').select('smtp').lean();
    return settings?.smtp || null;
  } catch {
    return null;
  }
}

// Backs `isEmailEnabled()` — see that function's doc comment for why this exists.
const EMAIL_ENABLED_CACHE_TTL_MS = 30_000;
let emailEnabledCache = { value: Boolean(env.SMTP_HOST), expiresAt: 0 };
let refreshingCache = false;

function updateEmailEnabledCache(hasHost) {
  emailEnabledCache = { value: Boolean(hasHost), expiresAt: Date.now() + EMAIL_ENABLED_CACHE_TTL_MS };
}

/**
 * Resolves the deployment's actual SMTP config for sending: `PlatformSettings.smtp` (DB) first,
 * falling back field-by-field to the matching `env.SMTP_*` var when a field is unset in the DB —
 * the exact same resolution rule `utils/effectiveSettings.js#resolveFamilySettings` uses for
 * per-family operational settings. `passEncrypted` is decrypted here (via
 * `decryptFieldValue()`) and only here; the plaintext password never leaves this function.
 *
 * Deliberately NOT cached (beyond `isEmailEnabled()`'s own short-TTL boolean, see below) — looked
 * up fresh on every send. This app's send volume is low enough that a per-send Mongo read is
 * cheap, consistent with `getEffectiveFamilySettings()` not caching either.
 */
export async function getEffectiveSmtpConfig() {
  const dbSmtp = await loadPlatformSmtp();

  let pass = env.SMTP_PASS;
  if (dbSmtp?.passEncrypted) {
    try {
      pass = decryptFieldValue(dbSmtp.passEncrypted);
    } catch {
      // Corrupt/undecryptable value (shouldn't happen) — fall back to env rather than break
      // sending entirely.
      pass = env.SMTP_PASS;
    }
  }

  const config = {
    host: dbSmtp?.host ?? env.SMTP_HOST,
    port: dbSmtp?.port ?? env.SMTP_PORT,
    secure: dbSmtp?.secure ?? env.SMTP_SECURE,
    user: dbSmtp?.user ?? env.SMTP_USER,
    pass,
    mailFrom: dbSmtp?.mailFrom ?? env.MAIL_FROM,
  };

  updateEmailEnabledCache(config.host);
  return config;
}

function refreshEmailEnabledCacheInBackground() {
  if (refreshingCache) return;
  refreshingCache = true;
  getEffectiveSmtpConfig()
    .catch(() => {})
    .finally(() => {
      refreshingCache = false;
    });
}

/**
 * Whether outbound email is actually configured — reflects the EFFECTIVE host (DB override via
 * Platform Settings, or env fallback), not just `env.SMTP_HOST`, so "email not configured"
 * messaging elsewhere in the app (`GET /family`'s `emailEnabled`, `POST /members`' `sendInvite`
 * default) stays accurate even when SMTP is configured only from the settings panel.
 *
 * Existing call sites are synchronous (and outside this module's ownership), so this stays
 * synchronous too via a short-TTL (30s) cache: a stale/cold read returns the last known value
 * immediately (never blocks, never throws) and kicks off a background refresh for next time.
 * `invalidateSmtpCache()` forces an immediate refresh right after an admin saves new SMTP
 * settings, so callers don't wait out the TTL to see the change reflected.
 */
export function isEmailEnabled() {
  if (Date.now() < emailEnabledCache.expiresAt) {
    return emailEnabledCache.value;
  }
  refreshEmailEnabledCacheInBackground();
  return emailEnabledCache.value;
}

/** Force the next `isEmailEnabled()` call to trigger a fresh lookup instead of serving the cache. */
export function invalidateSmtpCache() {
  emailEnabledCache = { ...emailEnabledCache, expiresAt: 0 };
}

const SMTP_TIMEOUT_MS = 9000;

function buildTransporter(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    // Port 587/2525 style: plain connect then STARTTLS. Refuse to send credentials in clear text.
    requireTLS: !config.secure,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth: config.user || config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
}

async function attemptSend(job, transporter, config) {
  return transporter.sendMail({
    from: config.mailFrom || config.user,
    to: job.to,
    subject: job.subject,
    html: job.html,
    text: job.text,
  });
}

async function processJob(job) {
  const config = await getEffectiveSmtpConfig();

  if (!config.host) {
    if (!isProd) {
      const link = extractPrimaryLink(job.text, job.html);
      // eslint-disable-next-line no-console
      console.log(`[mailer] SMTP disabled — would send "${job.subject}" to ${job.to}${link ? ` (${link})` : ''}`);
    }
    return;
  }

  const transporter = buildTransporter(config);

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await attemptSend(job, transporter, config);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        // eslint-disable-next-line no-await-in-loop
        await delay(RETRY_DELAYS_MS[attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
      }
    }
  }
  // Never the body — subject + recipient only.
  // eslint-disable-next-line no-console
  console.warn(`[mailer] failed to send "${job.subject}" to ${job.to} after ${MAX_ATTEMPTS} attempts: ${lastErr?.message || lastErr}`);
}

const queue = [];
let draining = false;

async function drainQueue() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const job = queue.shift();
    // eslint-disable-next-line no-await-in-loop
    await processJob(job).catch(() => {}); // processJob already swallows its own errors; belt and braces
    job.resolve();
  }
  draining = false;
}

/**
 * Queue an email for delivery. Fire-and-forget from every call site — the returned promise
 * always resolves (never rejects), once the job has been attempted (and possibly given up on).
 * Callers that don't care about completion can simply call `sendMail({...})` without `await`.
 *
 *   sendMail({ to: 'admin@example.com', subject: 'New device login', html, text })
 */
export function sendMail({ to, subject, html, text }) {
  if (!to || !subject) {
    // eslint-disable-next-line no-console
    console.warn('[mailer] sendMail called without to/subject — dropped');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push({ to, subject, html, text, resolve });
    drainQueue();
  });
}

/** Maps a nodemailer/network error to a short admin-facing hint. Never includes secrets. */
export function describeMailError(err) {
  const code = err?.code || err?.responseCode || 'UNKNOWN';
  let hint = 'The mail server rejected or could not deliver the message.';
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ESOCKET', 'ECONNECTION', 'ENETUNREACH'].includes(err?.code)) {
    hint = 'Could not reach the mail server. Your host may block SMTP ports 25/465/587. Try port 2525 with Brevo (smtp-relay.brevo.com).';
  } else if (err?.code === 'ENOTFOUND' || err?.code === 'EDNS') {
    hint = 'The SMTP host name was not found. Check the host spelling.';
  } else if (err?.code === 'EAUTH' || err?.responseCode === 535) {
    hint = 'The mail server refused the username or password. For Brevo use your SMTP login and an SMTP key (not your account password).';
  } else if (err?.code === 'ETLS' || err?.code === 'ESTARTTLS') {
    hint = 'Could not start a secure connection. Check that the port and the Secure setting match your provider.';
  }
  return { code: String(code), hint };
}

/**
 * Sends one email right now and reports the REAL outcome: `{ ok: true }` only when the SMTP
 * server accepted the message. Single attempt, hard overall timeout, never throws. Failures are
 * logged (code + message only — never the password or the body).
 */
export async function sendMailNow({ to, subject, html, text }, { timeoutMs = 10000 } = {}) {
  const config = await getEffectiveSmtpConfig();
  if (!config.host) {
    if (!isProd) {
      const link = extractPrimaryLink(text, html);
      // eslint-disable-next-line no-console
      console.log(`[mailer] SMTP disabled — would send "${subject}" to ${to}${link ? ` (${link})` : ''}`);
    }
    return { ok: false, error: 'EMAIL_DISABLED', hint: 'Email is not set up yet. Add SMTP settings in the admin panel.' };
  }

  let timer;
  try {
    const transporter = buildTransporter(config);
    const send = attemptSend({ to, subject, html, text }, transporter, config);
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Timed out sending email'), { code: 'ETIMEDOUT' })), timeoutMs);
    });
    await Promise.race([send, timeout]);
    return { ok: true };
  } catch (err) {
    const { code, hint } = describeMailError(err);
    // eslint-disable-next-line no-console
    console.warn(`[mailer] failed to send "${subject}" to ${to}: ${code} ${String(err?.message || '').slice(0, 200)}`);
    return { ok: false, error: 'SEND_FAILED', code, hint };
  } finally {
    clearTimeout(timer);
  }
}
