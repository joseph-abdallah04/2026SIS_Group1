/**
 * Whether somebody is done with the "propose your first idea" hint for a
 * session.
 *
 * The hint is for the start of a meeting: it says where proposals come from,
 * once. Once it has been closed or followed into a tool, it has done its job,
 * and bringing it back on the next question — or after a refresh — would be
 * nagging.
 *
 * `localStorage` for the same reasons sticky drafts use it: it is one person's
 * progress through the UI, not board state. Keyed by session and user, so the
 * next session starts fresh and the next person on a shared machine still gets
 * the hint.
 *
 * Every access is wrapped. Storage throws outright in some private modes and
 * wherever site data is blocked; there, the worst outcome is seeing the hint
 * again.
 */
const KEY_PREFIX = 'rt_first_proposal_hint';

export function hintKeyFor(sessionId: string, userId: string): string {
  return `${KEY_PREFIX}:${sessionId}:${userId}`;
}

export function isHintRetired(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'retired';
  } catch {
    return false;
  }
}

export function retireHint(key: string): void {
  try {
    localStorage.setItem(key, 'retired');
  } catch {
    // Storage is unavailable. The hint is still gone for this page; only the
    // memory of it is lost.
  }
}
