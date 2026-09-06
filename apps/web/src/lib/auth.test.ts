import { describe, expect, it } from 'vitest';

import { isTokenExpired, safeReturnPath } from './auth';

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

describe('safeReturnPath', () => {
  it('returns same-origin paths as-is', () => {
    expect(safeReturnPath('/join/K7NP-3WQZ')).toBe('/join/K7NP-3WQZ');
    expect(safeReturnPath('/sessions/abc?x=1')).toBe('/sessions/abc?x=1');
  });

  it('rejects open redirects and the auth screens themselves', () => {
    expect(safeReturnPath('https://evil.example')).toBe('/dashboard');
    expect(safeReturnPath('//evil.example')).toBe('/dashboard');
    expect(safeReturnPath('/login')).toBe('/dashboard');
    expect(safeReturnPath(null)).toBe('/dashboard');
  });
});
