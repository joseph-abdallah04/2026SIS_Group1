import jwt from 'jsonwebtoken';

import { env } from '../../env.js';

const EXPIRES_IN = '7d';

export interface TokenPayload {
  userId: string;
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; code: 'TOKEN_EXPIRED' | 'INVALID_TOKEN' };

// Payload is deliberately just `{ userId }` — jsonwebtoken adds `iat`/`exp`
// itself from `expiresIn`, giving the `{ userId, iat, exp }` shape the F01
// ticket specifies. Nothing else is embedded, so a stale token can't carry a
// display name that's since changed.
export function signToken({ userId }: TokenPayload): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (typeof decoded !== 'object' || decoded === null || typeof decoded.userId !== 'string') {
      return { ok: false, code: 'INVALID_TOKEN' };
    }
    return { ok: true, userId: decoded.userId };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return { ok: false, code: 'TOKEN_EXPIRED' };
    }
    // Malformed, tampered signature, wrong algorithm, etc.
    return { ok: false, code: 'INVALID_TOKEN' };
  }
}
