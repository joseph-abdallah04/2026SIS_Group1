// Keeping the assistant transcript across a page refresh (F34).
//
// `sessionStorage`, not `localStorage`, on purpose. The chat is private to one person in one
// session and is not worth keeping forever: this scope survives a refresh and a navigation,
// and goes away when the tab does. Keyed per session id, so two sessions open in two tabs
// never show each other's conversation.
//
// Storage is best-effort throughout. Private-mode browsers throw on access, quotas run out,
// and a transcript from an older build may not match today's shapes. Every one of those ends
// as "start with an empty chat", never as a crash.
import { parseArtifact, type AssistantToolName, type WebSearchResult } from '@roundtable/shared';

import type { ChatEntry, ProposeState } from './useAssistantChat';

const KEY_PREFIX = 'rt_assistant_chat:';

/**
 * Ceiling on one stored transcript. `sessionStorage` gives roughly 5 MB for the whole origin
 * and the assistant is not the only thing that may want some, so this stays modest: a chat
 * with a few diagrams in it is a few tens of KB. Oldest entries are dropped to fit.
 */
export const MAX_STORED_BYTES = 256_000;

const TOOL_NAMES = new Set<string>(['web_search', 'create_diagram', 'sticky_ideation']);
const PROPOSE_STATES = new Set<string>(['idle', 'sending', 'proposed', 'failed']);

function storageKey(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** `sessionStorage` access throws outright in some privacy modes — not just on write. */
function safeStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadChat(sessionId: string): ChatEntry[] {
  const store = safeStorage();
  if (!store) return [];

  let raw: string | null;
  try {
    raw = store.getItem(storageKey(sessionId));
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map(reviveEntry).filter((entry): entry is ChatEntry => entry !== null);
}

export function saveChat(sessionId: string, entries: ChatEntry[]): void {
  const store = safeStorage();
  if (!store) return;

  if (entries.length === 0) {
    clearChat(sessionId);
    return;
  }

  // Trim from the front until it fits. Losing the start of a long conversation beats losing
  // all of it, and the recent turns are the ones worth coming back to.
  let candidate = entries;
  let payload = JSON.stringify(candidate);
  while (payload.length > MAX_STORED_BYTES && candidate.length > 1) {
    candidate = candidate.slice(1);
    payload = JSON.stringify(candidate);
  }
  if (payload.length > MAX_STORED_BYTES) return;

  try {
    store.setItem(storageKey(sessionId), payload);
  } catch {
    // Quota exceeded, or storage disabled mid-session. Nothing useful to do about it, and a
    // chat that fails to persist must not break the chat that is on screen.
  }
}

export function clearChat(sessionId: string): void {
  try {
    safeStorage()?.removeItem(storageKey(sessionId));
  } catch {
    // ignore
  }
}

/**
 * Rebuilds one entry, or returns null if it is not something this build can render.
 *
 * In-flight states are resolved on the way back in, because whatever they were waiting for
 * died with the old page: a half-streamed reply is no longer streaming, a tool that was
 * running never finished, and a Propose that was mid-flight has no request behind it any
 * more. Leaving any of those as they were stores a spinner that never stops.
 */
function reviveEntry(value: unknown): ChatEntry | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
  if (!id) return null;

  switch (entry.kind) {
    case 'user':
      return typeof entry.text === 'string' ? { kind: 'user', id, text: entry.text } : null;

    case 'assistant':
      return typeof entry.text === 'string'
        ? { kind: 'assistant', id, text: entry.text, streaming: false }
        : null;

    case 'tool': {
      if (typeof entry.toolName !== 'string' || !TOOL_NAMES.has(entry.toolName)) return null;
      const wasRunning = entry.status === 'running';
      const summary = wasRunning
        ? 'Interrupted by a page refresh'
        : typeof entry.summary === 'string'
          ? entry.summary
          : undefined;
      const results = reviveSearchResults(entry.results);
      return {
        kind: 'tool',
        id,
        toolName: entry.toolName as AssistantToolName,
        status: !wasRunning && entry.status === 'done' ? 'done' : 'failed',
        ...(summary ? { summary } : {}),
        ...(results ? { results } : {}),
      };
    }

    case 'artifact': {
      if (typeof entry.source !== 'string' || !TOOL_NAMES.has(entry.source)) return null;
      // Validated rather than trusted: a transcript written by an older build may hold a
      // shape today's renderer would crash on, and dropping one card beats a blank panel.
      const artifact = parseArtifact(entry.artifact);
      if (!artifact.ok) return null;
      // 'sending' had a request behind it that no longer exists; anything else is a settled
      // outcome worth keeping, so you can see what you already put on the board.
      const stored = typeof entry.propose === 'string' ? entry.propose : 'idle';
      const propose: ProposeState =
        stored === 'sending' || !PROPOSE_STATES.has(stored) ? 'idle' : (stored as ProposeState);
      return {
        kind: 'artifact',
        id,
        source: entry.source as AssistantToolName,
        artifact: artifact.artifact,
        propose,
        ...(propose === 'failed' && typeof entry.proposeError === 'string'
          ? { proposeError: entry.proposeError }
          : {}),
      };
    }

    case 'error':
      return typeof entry.message === 'string'
        ? { kind: 'error', id, message: entry.message }
        : null;

    default:
      return null;
  }
}

/** Search results are rendered as links, so a malformed one is dropped rather than shown. */
function reviveSearchResults(value: unknown): WebSearchResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const results = value.filter((item): item is WebSearchResult => {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.title === 'string' &&
      typeof candidate.url === 'string' &&
      typeof candidate.snippet === 'string'
    );
  });
  return results.length > 0 ? results : undefined;
}
