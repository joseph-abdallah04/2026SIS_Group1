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
  | { kind: 'assistant'; id: string; text: string; streaming: boolean; interrupted?: boolean }
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
      /**
       * True once this card was seen on the live board. Propose stays "on the pinboard"
       * until that item disappears, so a delete can unlock the button again.
       */
      seenOnBoard?: boolean;
    }
  | { kind: 'error'; id: string; message: string };

/** Turns sent back to the model as context. Tool chatter and artifacts stay client-side. */
const HISTORY_LIMIT = 20;

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
  /** True only while the provider is streaming a reasoning channel this turn. */
  const [thinking, setThinking] = useState(false);
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
      setThinking(false);

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
            if (event.type === 'status' && event.phase === 'thinking') {
              setThinking(true);
              return;
            }
            if (event.type === 'tool' || event.type === 'message' || event.type === 'done') {
              setThinking(false);
            }
            const entryId = nextId();
            setEntries((prev) => applyEvent(prev, event, entryId));
          },
        });
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setThinking(false);
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
    setThinking(false);
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
              ...(propose === 'proposed' ? {} : { seenOnBoard: false }),
            }
          : entry,
      ),
    );
  }, []);

  /**
   * Propose is a local flag until we observe the matching board item — and it has to
   * drop again when that item is deleted, otherwise the card stays "On the pinboard"
   * with the button locked.
   */
  const syncProposedWithBoard = useCallback((items: readonly { artifactJson: ArtifactJson }[]) => {
    const artifacts = items.map((item) => item.artifactJson);
    setEntries((prev) => reconcileProposed(prev, artifacts));
  }, []);

  return {
    entries,
    streaming,
    thinking,
    send,
    stop,
    clear,
    setProposeState,
    syncProposedWithBoard,
  };
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
      // tool-input-start and tool-call can both arrive for the same call.
      const already = findLastIndex(
        entries,
        (entry) =>
          entry.kind === 'tool' && entry.toolName === event.toolName && entry.status === 'running',
      );
      if (already !== -1) return entries;
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

    case 'status':
      // Ephemeral — the panel holds "Thinking" in hook state, not the transcript.
      return entries;

    case 'done':
      return settleTurn(entries, event.reason === 'aborted', newId);
  }
}

/**
 * Flattens the transcript into the turns the model sees next time.
 *
 * `content` carries only words that were actually said. What a turn *did* — the artifacts
 * it produced, the tools that failed, whether the user cancelled it — travels as
 * structured fields the server renders into the instructions, because the model needs
 * those facts and must not mistake them for prose. Without the artifact record its own
 * view of the conversation is "the user asked for five sticky notes and I replied with
 * one vague sentence", which reads as a request it never satisfied and gets retried on
 * the next message. Without the failure record, a call that produced nothing is
 * indistinguishable from one that worked. Without the stop flag, "why did you stop?"
 * is answered as if the model chose to pause.
 *
 * Both travel *beside* the text rather than inside it. Written into the content they came
 * back out as chat: the model copied its own last turn verbatim, note and all, and kept
 * announcing diagrams that the tool had failed to make.
 *
 * Artifacts and tool chips stream before the assistant's closing line, so they are
 * buffered and attached to the message that follows them.
 */
function toHistory(entries: ChatEntry[]): AssistantHistoryMessage[] {
  const messages: AssistantHistoryMessage[] = [];
  let artifacts: ArtifactJson['type'][] = [];
  let failedTools: AssistantToolName[] = [];
  let interrupted = false;

  const takeFacts = () => {
    const facts = {
      ...(artifacts.length > 0 ? { artifacts: [...artifacts] } : {}),
      ...(failedTools.length > 0 ? { failedTools: [...failedTools] } : {}),
      ...(interrupted ? { interrupted: true } : {}),
    };
    artifacts = [];
    failedTools = [];
    interrupted = false;
    return facts;
  };

  for (const entry of entries) {
    switch (entry.kind) {
      case 'artifact':
        artifacts.push(entry.artifact.type);
        break;
      case 'tool':
        if (entry.status === 'failed') failedTools.push(entry.toolName);
        break;
      case 'assistant': {
        if (entry.interrupted) interrupted = true;
        const content = assistantHistoryText(entry);
        // A turn that only made artifacts, failed a tool, or was stopped still has to
        // appear, or those facts are lost. Empty content is fine — the server drops it
        // from the dialogue and keeps the flags for the instructions.
        if (content.length > 0 || artifacts.length > 0 || failedTools.length > 0 || interrupted) {
          messages.push({ role: 'assistant', content, ...takeFacts() });
        }
        break;
      }
      case 'user':
        if (entry.text.length > 0) messages.push({ role: 'user', content: entry.text });
        break;
      default:
        break;
    }
  }

  // Anything still buffered belongs to the turn that just ended, which said nothing.
  if (artifacts.length > 0 || failedTools.length > 0) {
    messages.push({ role: 'assistant', content: '', ...takeFacts() });
  }

  return messages.slice(-HISTORY_LIMIT);
}

/**
 * The old artifact note, as it appears at the head of replies already sitting in a
 * restored transcript. Stripped on the way back to the model so an existing tab stops
 * teaching it the habit; without this the loop survives until the user clears the chat.
 */
const LEGACY_ARTIFACT_NOTE = /^\(Created [^)]*already on screen\.\)\s*/;

function assistantHistoryText(entry: Extract<ChatEntry, { kind: 'assistant' }>): string {
  return entry.text.trim().replace(LEGACY_ARTIFACT_NOTE, '');
}

/**
 * Closes the in-flight bubble. An abort also fails running tools and, if the model had
 * not started typing, leaves a marker so the next turn's history knows it was stopped.
 */
function settleTurn(entries: ChatEntry[], aborted: boolean, newId: string): ChatEntry[] {
  let closed = false;
  const next = entries.map((entry) => {
    if (entry.kind === 'assistant' && entry.streaming) {
      closed = true;
      return { ...entry, streaming: false, ...(aborted ? { interrupted: true } : {}) };
    }
    if (aborted && entry.kind === 'tool' && entry.status === 'running') {
      return { ...entry, status: 'failed' as const, summary: 'Stopped' };
    }
    if (entry.kind === 'assistant') return { ...entry, streaming: false };
    return entry;
  });

  if (aborted && !closed) {
    return [
      ...next,
      { kind: 'assistant', id: newId, text: '', streaming: false, interrupted: true },
    ];
  }
  return next;
}

/** Stable enough to match a proposed card to a board item across the create/delete cycle. */
export function artifactFingerprint(artifact: ArtifactJson): string {
  switch (artifact.type) {
    case 'sticky':
      return `sticky:${artifact.color}:${artifact.text}`;
    case 'diagram':
      return `diagram:${JSON.stringify(artifact.nodes)}:${JSON.stringify(artifact.edges)}`;
    case 'drawing':
      return `drawing:${artifact.svg}`;
  }
}

/**
 * Drops "On the pinboard" once the matching item is gone, but not before it has
 * appeared — the create ack can land before the board broadcast.
 */
export function reconcileProposed(
  entries: ChatEntry[],
  boardArtifacts: readonly ArtifactJson[],
): ChatEntry[] {
  const onBoard = new Set(boardArtifacts.map(artifactFingerprint));
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.kind !== 'artifact' || entry.propose !== 'proposed') return entry;
    const present = onBoard.has(artifactFingerprint(entry.artifact));
    if (present) {
      if (entry.seenOnBoard) return entry;
      changed = true;
      return { ...entry, seenOnBoard: true };
    }
    if (entry.seenOnBoard) {
      changed = true;
      return { ...entry, propose: 'idle' as const, seenOnBoard: false };
    }
    return entry;
  });
  return changed ? next : entries;
}

/** Exported for tests — the shape the next turn sends as `history`. */
export function transcriptToHistory(entries: ChatEntry[]): AssistantHistoryMessage[] {
  return toHistory(entries);
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
