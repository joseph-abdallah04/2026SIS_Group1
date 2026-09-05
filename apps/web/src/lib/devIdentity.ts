/**
 * ⚠️ Development only — delete this file when the auth module lands.
 *
 * With no login yet, acting as a particular seeded member means putting an id
 * into `localStorage` by hand, which in practice means pasting into the browser
 * console. This reads the same thing off the URL instead:
 *
 *   /sessions/<sessionId>?devUser=<userId>
 *
 * so two windows can be opened as two different members from a link alone. The
 * parameter is consumed and stripped from the address bar, leaving the identity
 * in `localStorage` exactly as if it had been set there directly — a refresh
 * keeps it, and `rt_dev_user_id` remains the single source of truth.
 *
 * The `import.meta.env.DEV` guard is statically eliminated by Vite, so none of
 * this reaches a production bundle.
 */

function base64url(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A JWT-shaped (but unsigned) string, purely so `lib/auth.tsx`'s `RequireAuth`
 * — which now decodes `exp` from real logins (F02) — treats it as unexpired.
 * Nothing verifies the signature client-side; nothing server-side accepts it
 * either, since the backend routes this identity reaches (voice, pinboard) use
 * their own dev stand-ins that read `rt_dev_user_id` directly and ignore this
 * token entirely (see `apps/server/src/modules/voice/routes.ts`). It exists
 * only to get past the frontend route guard.
 */
function devToken(): string {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({ sub: 'dev', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 });
  return `${header}.${payload}.dev`;
}

export function applyDevIdentityFromUrl(): void {
  if (!import.meta.env.DEV) return;

  const url = new URL(window.location.href);
  const devUser = url.searchParams.get('devUser');
  if (!devUser) return;

  localStorage.setItem('rt_dev_user_id', devUser);
  // Don't clobber a real token from an actual login (F02) — only fill in the
  // gap for routes that need *a* token to pass `RequireAuth` but have no
  // sessions module yet to log in and join through for real.
  if (!localStorage.getItem('rt_token')) localStorage.setItem('rt_token', devToken());

  url.searchParams.delete('devUser');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

  console.warn(`[dev] acting as user ${devUser} (development only)`);
}
