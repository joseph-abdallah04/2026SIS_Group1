// Chat state for one session's assistant panel.
//
// The transcript is a flat, ordered timeline of entries rather than a messages array with
// side-channels: tool activity and artifacts appear exactly where they happened, which is
// what makes a tool-using agent readable.
//
// History lives only here. The server stores nothing about a conversation (docs/06) — each
// request carries the turns the client chooses to send. A copy is mirrored into
// `sessionStorage` so a refresh does not throw the thread away; see chatStorage.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssistantContext,
  AssistantHistoryMessage,
  AssistantStreamEvent,
  AssistantToolName,
  ArtifactJson,
  WebSearchResult,
} from '@roundtable/shared';

import { streamAssistantChat } from './api';
import { clearChat, loadChat, saveChat } from './chatStorage';

export type ProposeState = 'idle' | 'sending' | 'proposed' | 'failed';

export type ChatEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      toolName: AssistantToolName;
      status: 'running' | 'done' | 'failed';
      summary?: string;
      results?: WebSearchResult[];
    }
  | {
      kind: 'artifact';
      id: string;
      source: AssistantToolName;
      artifact: ArtifactJson;
      propose: ProposeState;
      proposeError?: string;
    }
  | { kind: 'error'; id: string; message: string };

/** Turns sent back to the model as context. Tool chatter and artifacts stay client-side. */
const HISTORY_LIMIT = 10;

/**
 * How long to wait after the transcript settles before writing it.
 *
 * Streaming changes state several times a second and `sessionStorage.setItem` is synchronous,
 * so writing on every delta would serialize the whole conversation into a blocking call over
 * and over while the reply types out. Half a second is short enough that a refresh mid-answer
 * still finds your question, and long enough that streaming costs one write per beat.
 */
const SAVE_DEBOUNCE_MS = 500;

export interface UseAssistantChatOptions {
  sessionId: string;
  /** Read fresh on every send, so the agent sees the board as it is *now*. */
  getContext: () => AssistantContext;
}

export function useAssistantChat({ sessionId, getContext }: UseAssistantChatOptions) {
  // Lazy initialiser: reads storage once on mount rather than on every render.
  const [entries, setEntries] = useState<ChatEntry[]>(() => loadChat(sessionId));
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Mirror the transcript to sessionStorage, debounced. The write happens on the way out too,
  // so a refresh landing inside the debounce window still keeps the last change.
  const latest = useRef(entries);
  latest.current = entries;
  useEffect(() => {
    const timer = setTimeout(() => saveChat(sessionId, latest.current), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [entries, sessionId]);
  useEffect(() => {
    return () => saveChat(sessionId, latest.current);
  }, [sessionId]);

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || abortRef.current) return;

      const history = toHistory(entries);
      const userEntryId = nextId();
      setEntries((prev) => [...prev, { kind: 'user', id: userEntryId, text: trimmed }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamAssistantChat({
          sessionId,
          message: trimmed,
          context: getContext(),
          history,
          signal: controller.signal,
          // Both the id and the event are settled *before* the updater runs, so the updater
          // itself is a pure function of `prev`. See the note on applyEvent.
          onEvent: (event) => {
            const entryId = nextId();
            setEntries((prev) => applyEvent(prev, event, entryId));
          },
        });
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setEntries((prev) =>
          prev.map((e) => (e.kind === 'assistant' ? { ...e, streaming: false } : e)),
        );
      }
    },
    [entries, getContext, sessionId],
  );

  /** Cancel mid-answer — stops the LLM call server-side too, so it stops costing money. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setEntries([]);
    clearChat(sessionId);
  }, [sessionId]);

  const setProposeState = useCallback((entryId: string, propose: ProposeState, error?: string) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.kind === 'artifact' && entry.id === entryId
          ? {
              ...entry,
              propose,
              ...(error ? { proposeError: error } : { proposeError: undefined }),
            }
          : entry,
      ),
    );
  }, []);

  return { entries, streaming, send, stop, clear, setProposeState };
}

/**
 * The conversation, as handed to the panel.
 *
 * Held by `AssistantBubble` rather than the panel: F34 requires the thread to survive
 * collapsing, and a stream in flight must keep arriving while the panel is shut so the
 * unread dot has an answer to point at.
 */
export type AssistantChat = ReturnType<typeof useAssistantChat>;

/**
 * Folds one stream event into the transcript.
 *
 * This MUST be a pure function of `entries` — no refs, no counters, no I/O. React invokes
 * state updaters twice under StrictMode precisely to surface impurity, and an earlier
 * version of this tracked "the bubble currently being streamed" in a ref that it wrote to
 * from in here. On the second invocation that ref already pointed at a bubble the (unchanged)
 * `entries` did not contain, so the append found nothing to append to and returned the array
 * untouched: every assistant word was silently dropped, while tool and artifact events —
 * plain appends, harmless to run twice — kept rendering. Which bubble is open is therefore
 * derived from the transcript itself, and `newId` is minted by the caller.
 */
export function applyEvent(
  entries: ChatEntry[],
  event: AssistantStreamEvent,
  newId: string,
): ChatEntry[] {
  switch (event.type) {
    case 'message': {
      // Grow the bubble still streaming at the tail; anything else (a tool call, an
      // artifact) has ended it, so the text after it starts a fresh one.
      const last = entries[entries.length - 1];
      if (last?.kind === 'assistant' && last.streaming) {
        return [...entries.slice(0, -1), { ...last, text: last.text + event.content }];
      }
      return [...entries, { kind: 'assistant', id: newId, text: event.content, streaming: true }];
    }

    case 'tool': {
      return [...entries, { kind: 'tool', id: newId, toolName: event.toolName, status: 'running' }];
    }

    case 'tool-result': {
      // Resolve the most recent running entry for this tool.
      const index = findLastIndex(
        entries,
        (entry) =>
          entry.kind === 'tool' && entry.toolName === event.toolName && entry.status === 'running',
      );
      if (index === -1) return entries;
      const next = [...entries];
      next[index] = {
        ...(next[index] as Extract<ChatEntry, { kind: 'tool' }>),
        status: event.ok ? 'done' : 'failed',
        summary: event.summary,
        ...(event.results ? { results: event.results } : {}),
      };
      return next;
    }

    case 'artifact': {
      return [
        ...entries,
        {
          kind: 'artifact',
          // Server-generated id — the Propose button needs a stable handle.
          id: event.artifactId,
          source: event.source,
          artifact: event.artifact,
          propose: 'idle',
        },
      ];
    }

    case 'error': {
      return [...entries, { kind: 'error', id: newId, message: event.message }];
    }

    case 'done':
      return entries.map((entry) =>
        entry.kind === 'assistant' ? { ...entry, streaming: false } : entry,
      );
  }
}

/**
 * Flattens the transcript into the turns the model sees next time.
 *
 * Artifacts are folded into the assistant turn they belong to, as a short note. Without it
 * the model's own view of the conversation is "the user asked for five sticky notes and I
 * replied with one vague sentence" — which reads as a request it never satisfied, and it
 * tries again on the following message. Artifacts stream *before* the assistant's summary
 * line, so they are buffered and attached to the message that follows them.
 */
function toHistory(entries: ChatEntry[]): AssistantHistoryMessage[] {
  const messages: AssistantHistoryMessage[] = [];
  let pending: ArtifactJson['type'][] = [];

  const flushPending = (trailingText: string) => {
    const content = `${artifactNote(pending)}${trailingText}`.trim();
    pending = [];
    if (content.length > 0) messages.push({ role: 'assistant', content });
  };

  for (const entry of entries) {
    switch (entry.kind) {
      case 'artifact':
        pending.push(entry.artifact.type);
        break;
      case 'assistant':
        flushPending(entry.text);
        break;
      case 'user':
        // Artifacts with no closing remark still happened — record them before moving on.
        if (pending.length > 0) flushPending('');
        if (entry.text.length > 0) messages.push({ role: 'user', content: entry.text });
        break;
      default:
        break;
    }
  }
  if (pending.length > 0) flushPending('');

  return messages.slice(-HISTORY_LIMIT);
}

function artifactNote(artifacts: ArtifactJson['type'][]): string {
  if (artifacts.length === 0) return '';
  const counts = artifacts.reduce<Record<string, number>>((acc, type) => {
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});
  const parts = Object.entries(counts).map(([type, count]) =>
    count === 1 ? `1 ${type}` : `${count} ${type}s`,
  );
  return `(Created ${parts.join(' and ')} for the user; they are already on screen.) `;
}

function findLastIndex(entries: ChatEntry[], predicate: (entry: ChatEntry) => boolean): number {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (predicate(entries[i] as ChatEntry)) return i;
  }
  return -1;
}

// Ids only need to be unique within a render tree, but a restored transcript makes that
// harder than it looks: the counter starts at zero again after a reload, so a plain `e1`
// would collide with the `e1` that came back out of storage and React would key two
// different entries the same. The per-load prefix makes a collision impossible without
// having to scan what was restored.
const LOAD_PREFIX = Math.random().toString(36).slice(2, 8);
let counter = 0;
function nextId(): string {
  counter += 1;
  return `e${LOAD_PREFIX}${counter}`;
}
