import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '../../env.js';
import { signToken, verifyToken } from './jwt.js';

// Pure logic only — no DB, mirrors pinboard/service.test.ts's convention.

describe('signToken / verifyToken', () => {
  it('round-trips a userId', () => {
    const token = signToken({ userId: 'user-1' });
    const result = verifyToken(token);
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('embeds iat and exp on the decoded payload', () => {
    const token = signToken({ userId: 'user-1' });
    const decoded = jwt.decode(token);
    expect(decoded).toMatchObject({ userId: 'user-1' });
    expect(typeof (decoded as jwt.JwtPayload).iat).toBe('number');
    expect(typeof (decoded as jwt.JwtPayload).exp).toBe('number');
  });

  it('rejects a tampered signature', () => {
    const token = signToken({ userId: 'user-1' });
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(verifyToken(tampered)).toEqual({ ok: false, code: 'INVALID_TOKEN' });
  });

  it('rejects garbage input', () => {
    expect(verifyToken('not-a-jwt')).toEqual({ ok: false, code: 'INVALID_TOKEN' });
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ userId: 'user-1' }, env.JWT_SECRET, { expiresIn: '-1s' });
    expect(verifyToken(expired)).toEqual({ ok: false, code: 'TOKEN_EXPIRED' });
  });
});
