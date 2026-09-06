import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as authLib from './auth';

vi.mock('./auth', async () => {
  const actual = await vi.importActual<typeof import('./auth')>('./auth');
  return { ...actual, redirectToLogin: vi.fn() };
});

const { api, ApiClientError } = await import('./api');

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('api request 401 handling', () => {
  beforeEach(() => {
    vi.mocked(authLib.redirectToLogin).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to login for an auth-middleware rejection (TOKEN_EXPIRED)', async () => {
    mockFetchOnce(401, { error: 'Token expired', code: 'TOKEN_EXPIRED' });

    await expect(api.get('/api/whatever')).rejects.toBeInstanceOf(ApiClientError);
    expect(authLib.redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it('does not redirect for a plain credentials error (INVALID_CREDENTIALS)', async () => {
    mockFetchOnce(401, { error: 'Incorrect email or password', code: 'INVALID_CREDENTIALS' });

    await expect(api.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiClientError);
    expect(authLib.redirectToLogin).not.toHaveBeenCalled();
  });
});
