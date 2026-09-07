// Thin fetch wrapper: JSON in/out, throws on !ok with the server's { error } shape.
// Same-origin in prod (Express serves the SPA); Vite proxy handles /api in dev.
import { getToken, redirectToLogin } from './auth';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// Codes `requireAuth` itself emits (apps/server/src/middleware/auth.ts) — a
// response with one of these means the *session* is invalid, distinct from a
// plain-old 401 a route raises for its own reasons (e.g. login's
// INVALID_CREDENTIALS), which must NOT bounce the user to /login.
const AUTH_FAILURE_CODES = new Set(['MISSING_TOKEN', 'INVALID_TOKEN', 'TOKEN_EXPIRED']);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    if (body?.code && AUTH_FAILURE_CODES.has(body.code)) {
      redirectToLogin();
    }
    throw new ApiClientError(
      res.status,
      body?.error ?? `Request failed (${res.status})`,
      body?.code,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
