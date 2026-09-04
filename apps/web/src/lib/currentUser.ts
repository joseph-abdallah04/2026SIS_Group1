// The one place the app answers "who is this browser acting as?".
//
// Until F01–F03 land there is no login and no JWT, so identity is a dev-only
// stand-in: an id pasted into `rt_dev_user_id` (see `DevUserSwitcher`), sent
// to the server as the `x-dev-user-id` header and as the socket handshake's
// `devUserId`. The server refuses both unless NODE_ENV is development.
//
// TODO(auth, F01–F03): return the authenticated user's id — from the auth
// context or the verified JWT — and delete `DEV_USER_ID_KEY`. No caller of
// `useCurrentUserId` needs to change when that happens; that is the point of
// routing every identity question through here instead of reading
// localStorage at each call site.

export const DEV_USER_ID_KEY = 'rt_dev_user_id';

/** Non-hook form, for module-level plumbing (the api client, the socket handshake). */
export function getCurrentUserId(): string | null {
  return import.meta.env.DEV ? localStorage.getItem(DEV_USER_ID_KEY) : null;
}

/**
 * Component form — a hook, even though today's body needs no React state, so
 * that real auth (which will come from context) slots in without changing the
 * shape of a single call site.
 *
 * Returns `null` in every production build, because the dev stand-in is
 * stripped there. Compare, never assume: `session.leaderId === id` is then
 * correctly `false`, so leader-only controls hide instead of leaking. The
 * flip side is that leader UI is inert in production until F01–F03 — which is
 * only acceptable because the API 401s there too, so nothing is half-usable.
 */
export function useCurrentUserId(): string | null {
  return getCurrentUserId();
}
