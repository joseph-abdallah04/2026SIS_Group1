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

function throwIfFailed(status: number, body: { error?: string; code?: string } | null): void {
  if (body?.code && AUTH_FAILURE_CODES.has(body.code)) {
    redirectToLogin();
  }
  throw new ApiClientError(
    status,
    body?.error ?? `Request failed (${status})`,
    body?.code,
  );
}

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
    throwIfFailed(res.status, body);
  }
  return body as T;
}

const FILENAME_PATTERN = /filename="([^"]+)"/;

function filenameFrom(disposition: string | null): string | null {
  return disposition ? (FILENAME_PATTERN.exec(disposition)?.[1] ?? null) : null;
}

/**
 * Fetch a file the same way `request` fetches JSON: bearer token in the
 * header. A plain `<a href>` cannot set `Authorization`, so a download has to
 * go through fetch — putting the token in the query string instead would copy
 * a live seven-day credential into browser history and every access log
 * between here and the server.
 */
async function download(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = getToken();
  const res = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    throwIfFailed(res.status, body);
  }
  return {
    blob: await res.blob(),
    filename: filenameFrom(res.headers.get('Content-Disposition')),
  };
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  download,
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'DELETE', ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }),
};
