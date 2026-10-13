/**
 * The link that takes someone straight to a session's join flow
 * (`/join/:code`), on whichever site this is running on.
 */
export function joinLink(code: string): string {
  return `${window.location.origin}/join/${code}`;
}
