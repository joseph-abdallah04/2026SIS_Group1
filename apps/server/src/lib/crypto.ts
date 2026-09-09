// AES-256-GCM helpers for secrets we must store and later reuse — today that is only the
// user's LLM API key (docs/05 §8: "encrypted at rest, decrypted only in memory during
// assistant calls, never returned in API responses").
//
// GCM is authenticated encryption: it both hides the plaintext and detects tampering, so a
// row edited in the database fails to decrypt instead of yielding garbage.
//
// Format: `v1.<iv>.<authTag>.<ciphertext>`, each part base64url. The version prefix means a
// future key rotation can decrypt old values while writing new ones.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce — the size GCM is defined for.
const AUTH_TAG_BYTES = 16;

export class SecretCryptoError extends Error {}

/**
 * Derives the 32-byte AES key from the configured secret.
 *
 * SHA-256 rather than a KDF with a salt is deliberate: `LLM_KEY_ENCRYPTION_SECRET` is a
 * generated high-entropy value (not a human password), and a salt-free derivation keeps
 * decryption stateless. If the secret ever becomes user-chosen, switch to scrypt here.
 */
function deriveKey(secret: string): Buffer {
  if (!secret || secret.length < 16) {
    throw new SecretCryptoError(
      'LLM_KEY_ENCRYPTION_SECRET is missing or too short (need at least 16 characters)',
    );
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  if (plaintext.length === 0) {
    throw new SecretCryptoError('Refusing to encrypt an empty secret');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, b64(iv), b64(authTag), b64(ciphertext)].join('.');
}

export function decryptSecret(token: string, secret: string): string {
  const parts = token.split('.');
  if (parts.length !== 4) {
    throw new SecretCryptoError('Malformed encrypted secret');
  }
  const [version, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  if (version !== VERSION) {
    throw new SecretCryptoError(`Unsupported encrypted secret version "${version}"`);
  }

  const iv = unb64(ivPart);
  const authTag = unb64(tagPart);
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new SecretCryptoError('Malformed encrypted secret');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(unb64(dataPart)), decipher.final()]).toString('utf8');
  } catch (cause) {
    if (cause instanceof SecretCryptoError) throw cause;
    // Wrong key or tampered ciphertext both land here. Never leak the underlying message.
    throw new SecretCryptoError('Could not decrypt secret — wrong key or corrupted value');
  }
}

/** Cheap shape check used before attempting an expensive decrypt. */
export function looksEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}

/** `sk-abc…xyz` → `sk-…xyz`: safe to show in a UI or log line. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}••••${value.slice(-4)}`;
}

function b64(buf: Buffer): string {
  return buf.toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
