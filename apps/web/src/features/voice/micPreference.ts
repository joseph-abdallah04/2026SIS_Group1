/**
 * Whether you were muted last time you were in this session (F12 — "mute state
 * survives page refresh within a session").
 *
 * `localStorage` rather than the server: voice owns no database tables
 * (docs/06 §Voice) and LiveKit holds the live mute state, so the only thing
 * missing across a refresh is your *intent* — which is a client preference, not
 * shared state. Storing it server-side would mean a new column and an endpoint
 * in the sessions owner's module for a value nobody else reads.
 *
 * Keyed by session *and* user: two people who share a browser sign in and out
 * of the same origin, and inheriting someone else's mute would be a surprise
 * that is hard to explain — you would look muted to the room for no visible
 * reason.
 *
 * Every access is wrapped: `localStorage` throws outright in Safari's private
 * mode and wherever site data is blocked, and a stored preference is never
 * worth failing a join over.
 */
const KEY_PREFIX = 'rt_mic_muted';

function keyFor(sessionId: string, userId: string): string {
  return `${KEY_PREFIX}:${sessionId}:${userId}`;
}

/** Defaults to false: a fresh participant joins the room able to speak. */
export function readMicMuted(sessionId: string, userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(sessionId, userId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Remember the state the mic actually reached, not the one that was asked for
 * — a refused unmute should not come back as "unmuted" on the next refresh.
 */
export function writeMicMuted(sessionId: string, userId: string, muted: boolean): void {
  try {
    const key = keyFor(sessionId, userId);
    // Removed rather than written as "0", so an unmuted participant leaves
    // nothing behind and the default above is what answers next time.
    if (muted) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Storage is unavailable or full. The toggle still worked for this visit;
    // only its memory is lost.
  }
}
