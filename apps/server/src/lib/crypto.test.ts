import { describe, expect, it } from 'vitest';

import {
  decryptSecret,
  encryptSecret,
  looksEncrypted,
  maskSecret,
  SecretCryptoError,
} from './crypto.js';

const SECRET = 'a-test-encryption-secret-32-chars!!';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a value', () => {
    const token = encryptSecret('sk-live-abcdef123456', SECRET);
    expect(decryptSecret(token, SECRET)).toBe('sk-live-abcdef123456');
  });

  it('never stores the plaintext', () => {
    const token = encryptSecret('sk-live-abcdef123456', SECRET);
    expect(token).not.toContain('sk-live');
    expect(token.startsWith('v1.')).toBe(true);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-value', SECRET);
    const b = encryptSecret('same-value', SECRET);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, SECRET)).toBe(decryptSecret(b, SECRET));
  });

  it('handles unicode', () => {
    const value = 'clé-🔐-ключ';
    expect(decryptSecret(encryptSecret(value, SECRET), SECRET)).toBe(value);
  });

  it('refuses the wrong key', () => {
    const token = encryptSecret('sk-live-abcdef123456', SECRET);
    expect(() => decryptSecret(token, 'a-different-secret-of-length-32!')).toThrow(
      SecretCryptoError,
    );
  });

  it('detects tampering (GCM auth tag)', () => {
    const token = encryptSecret('sk-live-abcdef123456', SECRET);
    const parts = token.split('.');
    // Flip a character in the ciphertext.
    const data = parts[3] as string;
    parts[3] = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
    expect(() => decryptSecret(parts.join('.'), SECRET)).toThrow(SecretCryptoError);
  });

  it('rejects a malformed token', () => {
    expect(() => decryptSecret('not-a-token', SECRET)).toThrow(SecretCryptoError);
    expect(() => decryptSecret('v2.a.b.c', SECRET)).toThrow(/version/i);
  });

  it('rejects a too-short encryption secret', () => {
    expect(() => encryptSecret('value', 'short')).toThrow(SecretCryptoError);
  });

  it('refuses to encrypt nothing', () => {
    expect(() => encryptSecret('', SECRET)).toThrow(SecretCryptoError);
  });
});

describe('helpers', () => {
  it('recognises its own tokens', () => {
    expect(looksEncrypted(encryptSecret('x', SECRET))).toBe(true);
    expect(looksEncrypted('sk-plaintext')).toBe(false);
  });

  it('masks a key for display', () => {
    expect(maskSecret('sk-abcdefghijkl')).toBe('sk-••••ijkl');
    expect(maskSecret('short')).toBe('••••');
  });
});
