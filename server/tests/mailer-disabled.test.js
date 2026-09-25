import './helpers/setupEnv.js';
import { describe, it, expect, vi } from 'vitest';
import { sendMail, sendMailNow, isEmailEnabled } from '../src/services/mailer.js';

// Deliberately does NOT import setupMailEnv.js — SMTP_HOST stays unset (the default), matching
// production's "optional, unset = disabled" behavior. `nodemailer` is intentionally left
// unmocked here: since the transporter is never created when SMTP_HOST is empty,
// `nodemailer.createTransport` (and any real network I/O) is never reached.

describe('mailer (SMTP not configured)', () => {
  it('reports email as disabled', () => {
    expect(isEmailEnabled()).toBe(false);
  });

  it('resolves without throwing and without a real transport', async () => {
    await expect(
      sendMail({ to: 'a@example.com', subject: 'Reset your password', html: '<p/>', text: 'link http://x/reset' }),
    ).resolves.toBeUndefined();
  });

  it('logs the subject + primary link to the console in non-production instead of sending', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await sendMail({
      to: 'a@example.com',
      subject: 'Reset your password',
      html: '<p><a href="https://app.example.com/reset-password?token=abc">Reset</a></p>',
      text: 'Reset your password: https://app.example.com/reset-password?token=abc',
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Reset your password'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('https://app.example.com/reset-password?token=abc'));
    logSpy.mockRestore();
  });

  it('sendMailNow reports ok: false + EMAIL_DISABLED', async () => {
    const res = await sendMailNow({ to: 'a@example.com', subject: 'Invite', html: '<p/>', text: 'x' });
    expect(res).toMatchObject({ ok: false, error: 'EMAIL_DISABLED' });
  });
});
