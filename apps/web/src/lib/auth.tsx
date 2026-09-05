import { Navigate, Outlet } from 'react-router-dom';

const TOKEN_KEY = 'rt_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Decodes a JWT's payload *without verifying the signature*. Only ever used for
 * client-side presentation decisions — the server re-derives identity from the
 * token on every request and socket handshake, so nothing here is trusted.
 * Malformed input decodes to null, which every caller treats as "no token".
 */
function decodePayload(token: string): { userId?: string; exp?: number } | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      userId?: string;
      exp?: number;
    };
  } catch {
    return null;
  }
}

/**
 * Reads the `exp` claim without verifying the signature — the server is the
 * only party that can actually trust a token; this is purely a client-side
 * routing shortcut so an obviously-stale token doesn't get sent at all.
 * Malformed input counts as expired (fail closed).
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodePayload(token);
  if (typeof decoded?.exp !== 'number') return true;
  return decoded.exp * 1000 <= Date.now();
}

/**
 * Who the stored token says we are, or null if there isn't one.
 *
 * The UI needs this to decide what to *offer* — a leader-only "Open for
 * joining" button, an author's own edit affordance — by comparing against ids
 * the server sent (`session.leaderId`, `proposal.authorId`). It is never what
 * makes an action allowed: every route and socket handler re-derives the user
 * from the token itself, so a tampered payload here changes what a page draws
 * and nothing about what the server accepts.
 */
export function getUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  return decodePayload(token)?.userId ?? null;
}

/** Clears the token and sends the browser to /login (unless already there). */
export function redirectToLogin(): void {
  clearToken();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * Auth gate: redirects to /login when no token is stored, or when the stored
 * one has expired. The server is the real gate (`requireAuth` rejects
 * missing/expired/tampered tokens on every request); this just decides
 * routing so an expired token doesn't render a page that will immediately
 * start failing its API calls.
 *
 * Uses React Router's `<Navigate>` (a soft redirect within the SPA) rather
 * than `redirectToLogin`'s hard `window.location` reload — that variant is
 * for `lib/api.ts`, which reacts to a 401 outside any component's render.
 */
export function RequireAuth() {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    clearToken();
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
