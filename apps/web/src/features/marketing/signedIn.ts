import { getToken, isTokenExpired } from '../../lib/auth';

/** Presentation-only: whether the header should offer Dashboard instead of auth. */
export function isSignedIn(): boolean {
  const token = getToken();
  return Boolean(token && !isTokenExpired(token));
}
