import type { SetupFormState } from './useSessionSetupForm';

/**
 * A new session's form, kept in this browser while it is being written, so
 * leaving by accident (Back, a crash, a closed tab) loses nothing. Per user,
 * one at a time, never sent anywhere. Only the create page keeps one: a draft
 * being edited is already saved on the server.
 */
export interface SavedSetup {
  version: 1;
  /** When it was last written, in ms since the epoch. */
  savedAt: number;
  state: SetupFormState;
}

const PREFIX = 'rt_setup_draft:';

/** Older than this, it is not worth offering back. */
export const SETUP_AUTOSAVE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setupAutosaveKey(userId: string | null | undefined): string | null {
  return userId ? `${PREFIX}${userId}` : null;
}

function isState(value: unknown): value is SetupFormState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const timer = (v: unknown) => v === null || typeof v === 'number';
  return (
    typeof state.title === 'string' &&
    typeof state.titlePlaceholder === 'string' &&
    typeof state.voiceEnabled === 'boolean' &&
    timer(state.discussionTimerSeconds) &&
    timer(state.votingTimerSeconds) &&
    (state.templateId === null || typeof state.templateId === 'string') &&
    Array.isArray(state.questions) &&
    state.questions.length > 0 &&
    state.questions.every(
      (q: unknown) =>
        !!q &&
        typeof q === 'object' &&
        typeof (q as Record<string, unknown>).key === 'string' &&
        typeof (q as Record<string, unknown>).text === 'string' &&
        typeof (q as Record<string, unknown>).votingEnabled === 'boolean',
    )
  );
}

/** The kept form, if there is one young enough and in a shape this build can read. */
export function readSetup(key: string, now = Date.now()): SavedSetup | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedSetup>;
    if (saved.version !== 1 || typeof saved.savedAt !== 'number' || !isState(saved.state)) {
      localStorage.removeItem(key);
      return null;
    }
    if (now - saved.savedAt > SETUP_AUTOSAVE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return saved as SavedSetup;
  } catch {
    // Storage off or full, or the entry unreadable: nothing to offer.
    return null;
  }
}

export function writeSetup(key: string, state: SetupFormState, now = Date.now()): void {
  try {
    const saved: SavedSetup = { version: 1, savedAt: now, state };
    localStorage.setItem(key, JSON.stringify(saved));
  } catch {
    // Keeping it is a courtesy; a browser that will not store it loses nothing else.
  }
}

export function clearSetup(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}

/**
 * Lets a user's kept form go: on logging out, or deleting the account, so an
 * agenda written on a shared computer does not wait there for the next person.
 * Not when a login simply expires: that is just when the copy is wanted.
 */
export function forgetSetup(userId: string | null | undefined): void {
  clearSetup(setupAutosaveKey(userId));
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function savedAgo(savedAt: number, now = Date.now()): string {
  const minutes = Math.floor((now - savedAt) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
