// Thin fetch wrapper: JSON in/out, throws on !ok with the server's { error } shape.
// Same-origin in prod (Express serves the SPA); Vite proxy handles /api in dev.

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

/** Where the JWT lives. Same key `lib/auth.tsx` guards routes on. */
export const TOKEN_STORAGE_KEY = 'rt_token';

/**
 * Headers every request carries. The Authorization header is sent as soon as a token
 * exists; the server ignores it until the Auth owner's middleware verifies it.
 */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
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
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
