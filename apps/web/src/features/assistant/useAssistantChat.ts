// Chat state for one session's assistant panel.
//
// The transcript is a flat, ordered timeline of entries rather than a messages array with
// side-channels: tool activity and artifacts appear exactly where they happened, which is
// what makes a tool-using agent readable.
//
// History lives only here. The server stores nothing about a conversation (docs/06) — each
// request carries the turns the client chooses to send.
import { useCallback, useRef, useState } from 'react';
import type {
  AssistantContext,
  AssistantHistoryMessage,
  AssistantStreamEvent,
  AssistantToolName,
  ProposalArtifact,
  WebSearchResult,
} from '@roundtable/shared';

import { streamAssistantChat } from './api';

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
      artifact: ProposalArtifact;
      propose: ProposeState;
      proposeError?: string;
    }
  | { kind: 'error'; id: string; message: string };

/** Turns sent back to the model as context. Tool chatter and artifacts stay client-side. */
const HISTORY_LIMIT = 10;

export interface UseAssistantChatOptions {
  sessionId: string;
  /** Read fresh on every send, so the agent sees the board as it is *now*. */
  getContext: () => AssistantContext;
}

export function useAssistantChat({ sessionId, getContext }: UseAssistantChatOptions) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Which assistant bubble the next text delta appends to. Reset by tool activity so the
  // reply after a tool call starts a fresh bubble instead of growing the old one.
  const openBubbleRef = useRef<string | null>(null);

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || abortRef.current) return;

      const history = toHistory(entries);
      setEntries((prev) => [...prev, { kind: 'user', id: nextId(), text: trimmed }]);
      openBubbleRef.current = null;
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
          onEvent: (event) => setEntries((prev) => applyEvent(prev, event, openBubbleRef)),
        });
      } finally {
        abortRef.current = null;
        openBubbleRef.current = null;
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
  }, []);

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

function applyEvent(
  entries: ChatEntry[],
  event: AssistantStreamEvent,
  openBubbleRef: { current: string | null },
): ChatEntry[] {
  switch (event.type) {
    case 'message': {
      const openId = openBubbleRef.current;
      if (openId) {
        return entries.map((entry) =>
          entry.kind === 'assistant' && entry.id === openId
            ? { ...entry, text: entry.text + event.content }
            : entry,
        );
      }
      const id = nextId();
      openBubbleRef.current = id;
      return [...entries, { kind: 'assistant', id, text: event.content, streaming: true }];
    }

    case 'tool': {
      openBubbleRef.current = null;
      return [
        ...entries,
        { kind: 'tool', id: nextId(), toolName: event.toolName, status: 'running' },
      ];
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
      openBubbleRef.current = null;
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
      openBubbleRef.current = null;
      return [...entries, { kind: 'error', id: nextId(), message: event.message }];
    }

    case 'done':
      openBubbleRef.current = null;
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
  let pending: ProposalArtifact['type'][] = [];

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

function artifactNote(artifacts: ProposalArtifact['type'][]): string {
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

let counter = 0;
function nextId(): string {
  counter += 1;
  return `e${counter}`;
}
