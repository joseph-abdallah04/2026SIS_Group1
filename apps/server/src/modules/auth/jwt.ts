import jwt from 'jsonwebtoken';

import { env } from '../../env.js';

const SESSION_EXPIRES_IN = '7d';
const EMAIL_VERIFY_EXPIRES_IN = '24h';
const PASSWORD_RESET_EXPIRES_IN = '30m';

export interface TokenPayload {
  userId: string;
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; code: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' };

// Session tokens and email-verification tokens are both plain JWTs signed
// with the same JWT_SECRET (no reason to provision a second secret for this).
// Without a purpose claim, a verification token — which also just carries a
// `userId` — would pass verifyToken's only check and work as a Bearer token
// through requireAuth, letting an emailed verification link double as a
// login credential. Each verifier below rejects the other purpose.
function signPurposeToken(
  purpose: string,
  { userId }: TokenPayload,
  expiresIn: jwt.SignOptions['expiresIn'],
): string {
  return jwt.sign({ userId, purpose }, env.JWT_SECRET, { expiresIn });
}

function verifyPurposeToken(purpose: string, token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.userId !== 'string' ||
      decoded.purpose !== purpose
    ) {
      return { ok: false, code: 'INVALID_TOKEN' };
    }
    return { ok: true, userId: decoded.userId };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, code: 'TOKEN_EXPIRED' };
    }
    return { ok: false, code: 'INVALID_TOKEN' };
  }
}

// Payload is deliberately just `{ userId, purpose }` — jsonwebtoken adds
// `iat`/`exp` itself from `expiresIn`. Nothing else is embedded, so a stale
// token can't carry a display name that's since changed.
export function signToken(payload: TokenPayload): string {
  return signPurposeToken('session', payload, SESSION_EXPIRES_IN);
}

export function verifyToken(token: string): VerifyResult {
  return verifyPurposeToken('session', token);
}

export function signEmailVerificationToken(payload: TokenPayload): string {
  return signPurposeToken('email-verify', payload, EMAIL_VERIFY_EXPIRES_IN);
}

export function verifyEmailVerificationToken(token: string): VerifyResult {
  return verifyPurposeToken('email-verify', token);
}

export interface PasswordResetPayload {
  userId: string;
  // A short fingerprint of the account's passwordHash at send-time (see
  // `passwordFingerprint` in service.ts) — not part of the generic
  // sign/verifyPurposeToken shape above, since no other token kind needs a
  // second claim. Letting `resetPassword` compare this against the *current*
  // hash is what makes the link single-use and auto-invalidate on password
  // change, without a separate consumed-tokens table.
  pwFingerprint: string;
}

export type PasswordResetVerifyResult =
  | { ok: true; userId: string; pwFingerprint: string }
  | { ok: false; code: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' };

export function signPasswordResetToken({ userId, pwFingerprint }: PasswordResetPayload): string {
  return jwt.sign({ userId, pwFingerprint, purpose: 'password-reset' }, env.JWT_SECRET, {
    expiresIn: PASSWORD_RESET_EXPIRES_IN,
  });
}

export function verifyPasswordResetToken(token: string): PasswordResetVerifyResult {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof decoded.userId !== 'string' ||
      typeof decoded.pwFingerprint !== 'string' ||
      decoded.purpose !== 'password-reset'
    ) {
      return { ok: false, code: 'INVALID_TOKEN' };
    }
    return { ok: true, userId: decoded.userId, pwFingerprint: decoded.pwFingerprint };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, code: 'TOKEN_EXPIRED' };
    }
    return { ok: false, code: 'INVALID_TOKEN' };
  }
}
