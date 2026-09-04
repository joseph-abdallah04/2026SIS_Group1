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
 * Reads the `exp` claim without verifying the signature — the server is the
 * only party that can actually trust a token; this is purely a client-side
 * routing shortcut so an obviously-stale token doesn't get sent at all.
 * Malformed input counts as expired (fail closed).
 */
export function isTokenExpired(token: string): boolean {
  const payload = token.split('.')[1];
  if (!payload) return true;
  try {
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    if (typeof decoded.exp !== 'number') return true;
    return decoded.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
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
