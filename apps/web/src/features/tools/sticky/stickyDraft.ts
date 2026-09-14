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
 * see it, and it is not board state until it is proposed. Keyed by session,
 * question and user: a note half-written for one question is an answer to that
 * question, and must not open on the next one; nor follow somebody into another
 * session, or appear for the next person to sign in on a shared machine.
 *
 * Drafts saved before the question was part of the key are never read. There
 * is no telling which question they were written for, so no question can be
 * trusted to show them.
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

export function draftKeyFor(sessionId: string, questionId: string, userId: string): string {
  return `${KEY_PREFIX}:${sessionId}:${questionId}:${userId}`;
}

/**
 * The saved draft, or null when there is none or what is stored is not one.
 *
 * Stored data outlives the code that wrote it, so it is checked rather than
 * trusted, and a note saved under a longer limit is cut to today's.
 *
 * Whitespace comes back as it was written. A draft that is nothing but
 * whitespace is not a note, so there is nothing to give back; and one too tall
 * for any sticky is fitted by the popup that opens it, not tidied here.
 */
export function readStickyDraft(key: string): StickyDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { text, color } = parsed as Record<string, unknown>;
    if (typeof text !== 'string' || !COLORS.includes(color as StickyColor)) return null;
    const note = text.slice(0, STICKY_TEXT_LIMIT);
    return note.trim() ? { text: note, color: color as StickyColor } : null;
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
