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
/** The same stand-in identity `devHeaders` sends — exported so UI can compare
 * it against a session's `leaderId` (e.g. to show the "Open for joining"
 * button only to the leader) without duplicating the localStorage key. */
export function getDevUserId(): string | null {
  return import.meta.env.DEV ? localStorage.getItem('rt_dev_user_id') : null;
}

function devHeaders(): Record<string, string> {
  const devUserId = getDevUserId();
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
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
