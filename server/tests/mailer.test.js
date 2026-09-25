import './helpers/setupEnv.js';
import './helpers/setupMailEnv.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vitest hoists `vi.mock` above imports — the mock-factory-referenced variable MUST be prefixed
// with "mock" (vitest's own hoisting-safety convention) or it throws "Cannot access before
// initialization".
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: (opts) => {
      mockCreateTransport(opts);
      return { sendMail: mockSendMail };
    },
  },
}));

const { sendMail, sendMailNow } = await import('../src/services/mailer.js');
const { parseEnvBool } = await import('../src/config/env.js');

beforeEach(() => {
  mockSendMail.mockReset();
});

describe('mailer (SMTP configured)', () => {
  it('sends through the configured transport', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '1' });

    await sendMail({ to: 'a@example.com', subject: 'Hello', html: '<p>hi</p>', text: 'hi' });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ to: 'a@example.com', subject: 'Hello', text: 'hi' });
  });

  it('retries on failure and succeeds once the transport recovers', async () => {
    mockSendMail
      .mockRejectedValueOnce(new Error('transient failure 1'))
      .mockRejectedValueOnce(new Error('transient failure 2'))
      .mockResolvedValueOnce({ messageId: '2' });

    await sendMail({ to: 'b@example.com', subject: 'Retry me', html: '<p/>', text: 'x' });

    expect(mockSendMail).toHaveBeenCalledTimes(3);
  });

  it('never throws (fire-and-forget) even once every retry is exhausted', async () => {
    mockSendMail.mockRejectedValue(new Error('always fails'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      sendMail({ to: 'c@example.com', subject: 'Doomed', html: '<p/>', text: 'x' }),
    ).resolves.toBeUndefined();

    expect(mockSendMail).toHaveBeenCalledTimes(3); // up to 3 attempts total
    // Failure log never includes the body — subject + recipient only.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Doomed'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('c@example.com'));
    warnSpy.mockRestore();
  });

  it('processes multiple queued emails without dropping any', async () => {
    mockSendMail.mockResolvedValue({});
    await Promise.all([
      sendMail({ to: 'x@example.com', subject: 'One', html: '<p/>', text: 'x' }),
      sendMail({ to: 'y@example.com', subject: 'Two', html: '<p/>', text: 'y' }),
      sendMail({ to: 'z@example.com', subject: 'Three', html: '<p/>', text: 'z' }),
    ]);
    expect(mockSendMail).toHaveBeenCalledTimes(3);
  });

  it('drops a call with no recipient/subject without throwing', async () => {
    await expect(sendMail({})).resolves.toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('sendMailNow (truthful delivery outcome)', () => {
  const msg = { to: 'a@example.com', subject: 'Invite', html: '<p/>', text: 'x' };

  it('ok: true only when the SMTP server accepted the message', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '1' });
    await expect(sendMailNow(msg)).resolves.toEqual({ ok: true });
  });

  it('ok: false + SEND_FAILED with a hint when the server rejects / times out, without retrying', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendMail.mockRejectedValueOnce(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    const res = await sendMailNow(msg);
    expect(res).toMatchObject({ ok: false, error: 'SEND_FAILED', code: 'ETIMEDOUT' });
    expect(res.hint).toContain('2525');
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls.flat().join(' ')).not.toContain('test-app-password');
    warnSpy.mockRestore();
  });

  it('gives up after the timeout when the transport hangs', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSendMail.mockReturnValueOnce(new Promise(() => {}));
    const res = await sendMailNow(msg, { timeoutMs: 30 });
    expect(res).toMatchObject({ ok: false, error: 'SEND_FAILED', code: 'ETIMEDOUT' });
    warnSpy.mockRestore();
  });

  it('builds a STARTTLS transport with timeouts when secure is false', async () => {
    // SMTP_SECURE=true in this suite -> implicit TLS, no requireTLS.
    mockSendMail.mockResolvedValueOnce({});
    await sendMailNow(msg);
    const opts = mockCreateTransport.mock.calls.at(-1)[0];
    expect(opts).toMatchObject({ secure: true, requireTLS: false });
    expect(opts.connectionTimeout).toBeGreaterThan(0);
    expect(opts.greetingTimeout).toBeGreaterThan(0);
    expect(opts.socketTimeout).toBeGreaterThan(0);
  });
});

describe('SMTP_SECURE parsing', () => {
  it('treats the string "false" as false (not truthy)', () => {
    expect(parseEnvBool('false')).toBe(false);
    expect(parseEnvBool('0')).toBe(false);
    expect(parseEnvBool('true')).toBe(true);
    expect(parseEnvBool(' TRUE ')).toBe(true);
    expect(parseEnvBool(undefined)).toBeUndefined();
  });
});
