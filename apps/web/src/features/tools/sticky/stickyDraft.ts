import type { StickyColor } from '@roundtable/shared';

import { STICKY_TEXT_LIMIT } from '../artifactLimits';

/**
 * The sticky somebody is part way through writing, kept until it is proposed.
 *
 * Closing the popup is not the same as throwing the note away. People close it
 * to look at the board, to answer somebody, or by pressing Escape out of habit,
 * and a note that vanished every time would teach them to write stickies
 * somewhere else first. So what is typed is saved as it is typed, and comes
 * back the next time the popup opens — after a refresh too.
 *
 * `localStorage` rather than the server, for the same reason the voice mute
 * preference is: an unproposed note is one person's intent, nobody else can
 * see it, and it is not board state until it is proposed. Keyed by session and
 * user, so a draft never follows somebody into another session, or appears for
 * the next person to sign in on a shared machine.
 *
 * Every access is wrapped. Storage throws outright in some private modes and
 * wherever site data is blocked, and a lost draft is never worth failing the
 * popup over.
 */
export interface StickyDraft {
  text: string;
  color: StickyColor;
}

const KEY_PREFIX = 'rt_sticky_draft';
const COLORS: readonly StickyColor[] = ['yellow', 'pink', 'blue', 'green'];

export function draftKeyFor(sessionId: string, userId: string): string {
  return `${KEY_PREFIX}:${sessionId}:${userId}`;
}

/**
 * The saved draft, or null when there is none or what is stored is not one.
 *
 * Stored data outlives the code that wrote it, so it is checked rather than
 * trusted, and a note saved under a longer limit is cut to today's.
 */
export function readStickyDraft(key: string): StickyDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { text, color } = parsed as Record<string, unknown>;
    if (typeof text !== 'string' || !COLORS.includes(color as StickyColor)) return null;
    return { text: text.slice(0, STICKY_TEXT_LIMIT), color: color as StickyColor };
  } catch {
    return null;
  }
}

/**
 * Save the draft as it stands. A note with nothing written in it is removed
 * rather than saved, so emptying the popup is how a draft is thrown away, and
 * an untouched popup leaves nothing behind.
 */
export function writeStickyDraft(key: string, draft: StickyDraft): void {
  try {
    if (draft.text.trim()) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Storage is unavailable or full. The note is still in the popup; only its
    // memory is lost.
  }
}

export function clearStickyDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear if storage cannot be reached.
  }
}
