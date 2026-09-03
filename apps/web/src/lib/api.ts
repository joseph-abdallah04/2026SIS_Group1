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

// Dev-only escape hatch, matching the realtime gateway and sessions REST
// routes' stand-in identity (apps/web/src/lib/socket.ts, apps/server/src/
// modules/sessions/routes.ts): with no login yet there is no JWT to send, so
// `rt_dev_user_id` lets the server know who a request is acting as. Never
// sent from a production build, and the server ignores it there regardless.
function devHeaders(): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  const devUserId = localStorage.getItem('rt_dev_user_id');
  return devUserId ? { 'x-dev-user-id': devUserId } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...devHeaders() },
    ...options,
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? `Request failed (${res.status})`, body?.code);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
};
