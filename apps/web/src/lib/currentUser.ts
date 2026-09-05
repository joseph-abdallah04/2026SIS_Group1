// The one place the app answers "who is this browser acting as?".
//
// The answer comes from the login token (F01/F02): `lib/auth.tsx` reads the
// `userId` claim out of it. Routing every identity question through here is
// what made swapping the earlier dev-only stand-in for real auth a change to
// this file alone, rather than to each call site.
//
// It is deliberately only ever used to decide what the UI *offers* — a
// leader-only button, an author's own edit affordance — by comparing against
// ids the server sent (`session.leaderId`, `proposal.authorId`). The token is
// unverified here, so a tampered one changes what a page draws and nothing
// about what the server accepts; every route and socket handler re-derives the
// user from the token itself.
import { getUserId } from './auth';

/** Non-hook form, for module-level plumbing and event handlers. */
export function getCurrentUserId(): string | null {
  return getUserId();
}

/**
 * Component form — a hook, even though today's body needs no React state, so
 * that moving identity into context later slots in without changing the shape
 * of a single call site.
 *
 * `null` only when there is no usable token, which the route guard has already
 * redirected away from. Compare, never assume: `session.leaderId === id` is
 * then correctly `false`, so leader-only controls hide rather than leak.
 */
export function useCurrentUserId(): string | null {
  return getCurrentUserId();
}
