/**
 * ⚠️ Development only — delete this file once seeded users can log in.
 *
 * The seed writes a placeholder password hash for its demo users, so there is
 * no password that will authenticate Alice or Bob through the real login form.
 * This reads an identity off the URL instead:
 *
 *   /sessions/<sessionId>?devUser=<userId>
 *
 * so two windows can be opened as two different members from a link alone. The
 * parameter is consumed and stripped from the address bar, leaving the identity
 * in `localStorage` exactly as if it had been set there directly — a refresh
 * keeps it, and `rt_dev_user_id` remains the single source of truth for the
 * socket handshake.
 *
 * The `import.meta.env.DEV` guard is statically eliminated by Vite, so none of
 * this reaches a production bundle.
 */

/** Base64url, as JWTs use it: no padding, and two substituted characters. */
function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A token shaped like a JWT, signed with nothing.
 *
 * The route guard decodes `exp` to decide whether to bother rendering a page,
 * and treats anything it cannot parse as expired. A placeholder string like
 * "dev" therefore fails closed and bounces straight to /login — which is
 * correct of the guard, and the reason this has to look like a real token.
 *
 * It will not survive contact with the server: `requireAuth` verifies the
 * signature, so any authenticated REST call made with this gets a 401. That is
 * fine for the board today, whose read is open in development and whose writes
 * go over a socket the stand-in gateway authenticates by `devUserId`. The
 * moment either of those starts checking a real token, this file's job is over.
 */
function unsignedDevToken(userId: string): string {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  });
  return `${header}.${payload}.dev-not-signed`;
}

export function applyDevIdentityFromUrl(): void {
  if (!import.meta.env.DEV) return;

  const url = new URL(window.location.href);
  const devUser = url.searchParams.get('devUser');
  if (!devUser) return;

  localStorage.setItem('rt_dev_user_id', devUser);
  // Always replaced, never preserved: a token left over from a real login
  // belongs to a different user, and the guard would keep routing as them
  // while the socket acted as this one.
  localStorage.setItem('rt_token', unsignedDevToken(devUser));

  url.searchParams.delete('devUser');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

  console.warn(`[dev] acting as user ${devUser} (development only)`);
}
