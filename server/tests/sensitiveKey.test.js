import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretField, isSensitiveKey } from '../src/modules/items/sensitiveKey.js';

describe('isSensitiveKey', () => {
  it.each([
    'PIN',
    'ATM PIN',
    'atm pin',
    'Debit card PIN',
    'MPIN',
    'mPIN',
    'M-PIN',
    'TPIN',
    'UPI PIN',
    'upi_pin',
    'Password',
    'Wi-Fi password',
    'Transaction Password',
    'Passcode',
    'passwd',
    'PWD',
    'OTP',
    'CVV',
    'CVV2',
    'cvc',
    'Security answer',
    'Security question answer',
    'Secret',
    'Secret code',
    'पिन',
    'एटीएम पिन',
    'पासवर्ड',
    'UPI पिन',
  ])('%s looks sensitive', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(['', null, undefined, 'Website', 'Customer ID', 'Branch', 'Pincode', 'Spinner', 'Shipping', 'Opinion', 'Passport number', 'Security question', 'IFSC'])(
    '%s does not',
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe('isSecretField', () => {
  it('uses the saved flag when there is one', () => {
    expect(isSecretField({ key: 'ATM PIN', secret: false })).toBe(false);
    expect(isSecretField({ key: 'Website', secret: true })).toBe(true);
  });

  it('falls back to the field name for rows saved before the flag existed', () => {
    expect(isSecretField({ key: 'ATM PIN' })).toBe(true);
    expect(isSecretField({ key: 'Website' })).toBe(false);
    expect(isSecretField(null)).toBe(false);
  });
});

describe('client copy', () => {
  it('client/src/features/items/sensitiveKey.js is identical to the server helper', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const server = readFileSync(path.join(here, '../src/modules/items/sensitiveKey.js'), 'utf8');
    const client = readFileSync(path.join(here, '../../client/src/features/items/sensitiveKey.js'), 'utf8');
    expect(client).toBe(server);
  });
});
