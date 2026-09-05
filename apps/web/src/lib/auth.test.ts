import { describe, expect, it } from 'vitest';

import { isTokenExpired } from './auth';

function fakeToken(payload: Record<string, unknown>): string {
  const base64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.fake-signature`;
}

describe('isTokenExpired', () => {
  it('is false for a token whose exp is in the future', () => {
    const token = fakeToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('is true for a token whose exp is in the past', () => {
    const token = fakeToken({ userId: 'u1', exp: Math.floor(Date.now() / 1000) - 10 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('is true (fail closed) for a token missing exp', () => {
    const token = fakeToken({ userId: 'u1' });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('is true (fail closed) for garbage input', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired('')).toBe(true);
  });
});
