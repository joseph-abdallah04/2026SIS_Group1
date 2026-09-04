// Thin fetch wrapper: JSON in/out, throws on !ok with the server's { error } shape.
// Same-origin in prod (Express serves the SPA); Vite proxy handles /api in dev.
import { getCurrentUserId } from './currentUser';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

// With no login yet there is no JWT to send, so the server is told who a
// request is acting as via a header. `lib/currentUser.ts` owns that identity
// (and the fact that it is empty in production); this only forwards it.
function devHeaders(): Record<string, string> {
  const userId = getCurrentUserId();
  return userId ? { 'x-dev-user-id': userId } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...devHeaders() },
    ...options,
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
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
