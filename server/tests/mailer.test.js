import './helpers/setupEnv.js';
import './helpers/setupMailEnv.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vitest hoists `vi.mock` above imports — the mock-factory-referenced variable MUST be prefixed
// with "mock" (vitest's own hoisting-safety convention) or it throws "Cannot access before
// initialization".
const mockSendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}));

const { sendMail } = await import('../src/services/mailer.js');

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
