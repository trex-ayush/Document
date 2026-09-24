import nodemailer from 'nodemailer';
import { env, isProd, isTest } from '../config/env.js';

/**
 * Gmail-SMTP-backed mailer, shared by every email-sending call site (alerts.js, auth's
 * forgot-password/invite flows, the test-email route). Design goals (see docs/DECISIONS.md /
 * this agent's final report):
 *
 *  - `SMTP_HOST` unset -> email is disabled entirely. In development we log the subject + the
 *    first link found in the message instead of sending, so the forgot-password/invite flows are
 *    still usable end-to-end on a laptop with no SMTP configured. In production we silently
 *    no-op (never crash, never spam prod logs with "email disabled" on every single activity).
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

let transporter; // lazily created, cached — undefined until first checked, null if disabled
let initialized = false;

function getTransporter() {
  if (!initialized) {
    initialized = true;
    if (env.SMTP_HOST) {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER || env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      });
    } else {
      transporter = null;
    }
  }
  return transporter;
}

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

async function attemptSend(job, activeTransporter) {
  return activeTransporter.sendMail({
    from: env.MAIL_FROM || env.SMTP_USER,
    to: job.to,
    subject: job.subject,
    html: job.html,
    text: job.text,
  });
}

async function processJob(job) {
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    if (!isProd) {
      const link = extractPrimaryLink(job.text, job.html);
      // eslint-disable-next-line no-console
      console.log(`[mailer] SMTP disabled — would send "${job.subject}" to ${job.to}${link ? ` (${link})` : ''}`);
    }
    return;
  }

  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await attemptSend(job, activeTransporter);
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

/** Whether outbound email is actually configured (used to gate invite-email defaults etc). */
export function isEmailEnabled() {
  return Boolean(env.SMTP_HOST);
}
