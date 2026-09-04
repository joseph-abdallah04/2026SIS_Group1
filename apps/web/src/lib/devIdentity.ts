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
export function applyDevIdentityFromUrl(): void {
  if (!import.meta.env.DEV) return;

  const url = new URL(window.location.href);
  const devUser = url.searchParams.get('devUser');
  if (!devUser) return;

  localStorage.setItem('rt_dev_user_id', devUser);
  // The route guard only checks that a token is present; a real one arrives
  // with the auth module, which is also when this whole file goes away.
  if (!localStorage.getItem('rt_token')) localStorage.setItem('rt_token', 'dev');

  url.searchParams.delete('devUser');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

  console.warn(`[dev] acting as user ${devUser} (development only)`);
}
