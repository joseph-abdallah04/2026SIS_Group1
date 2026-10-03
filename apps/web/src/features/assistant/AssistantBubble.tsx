// F34 — the assistant, docked on the right of the board.
//
// The chrome is `BoardRail`, the same piece as the agenda on the left. Collapsing
// unmounts the panel, so the conversation lives here: F34 requires the thread to
// survive open/close, and an unread mark when an answer lands while the rail is shut.
//
// Mounted by `SessionPinboard` inside `CreativeToolsProvider`, so Propose (F37) can
// use the same submit path as the sticky and drawing editors.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ArtifactJson, AssistantContext, QuestionStatus } from '@roundtable/shared';

import { BoardRail } from '../../components/BoardRail';
import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { AssistantPanel } from './AssistantPanel';
import { fetchLlmConfig } from './api';
import { useAssistantChat } from './useAssistantChat';

export interface AssistantBubbleProps {
  sessionId: string;
  /**
   * Called on every send so the agent sees the board as it is at that moment — active
   * question, recent proposals, who wrote them.
   */
  getContext?: () => AssistantContext;
  /**
   * Live board items, so a Propose that has landed can unlock again after the user
   * deletes that card. The model still reads the board server-side; this is only the
   * Propose button's view of reality.
   */
  boardItems?: readonly { artifactJson: ArtifactJson }[];
  /** The pinboard's current phase, so a locked Propose can say why it is locked. */
  questionStatus?: QuestionStatus | null;
  /**
   * A ballot covers the board and both rails. The strip stays in the row, so the
   * board does not change width under the overlay, and is marked inert so it is
   * not something else to tab into while people are voting.
   */
  suppressed?: boolean;
}

export function AssistantBubble({
  sessionId,
  getContext,
  boardItems,
  questionStatus,
  suppressed = false,
}: AssistantBubbleProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [unread, setUnread] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>(undefined);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const resolveContext = useCallback((): AssistantContext => getContext?.() ?? {}, [getContext]);
  const chat = useAssistantChat({ sessionId, getContext: resolveContext });
  const { syncProposedWithBoard } = chat;
  const creativeTools = useContext(CreativeToolsContext);

  const collapse = useCallback(() => setCollapsed(true), []);

  // The studio is a page-modal. A rail left open underneath is out of the way,
  // but collapsing it keeps the board clear when the editor closes.
  useEffect(() => {
    if (creativeTools?.activeTool) collapse();
  }, [collapse, creativeTools?.activeTool]);

  useEffect(() => {
    if (suppressed) collapse();
  }, [collapse, suppressed]);

  useEffect(() => {
    syncProposedWithBoard(boardItems ?? []);
  }, [boardItems, syncProposedWithBoard]);

  // An answer that finished while the rail was shut is the thing the mark shows.
  // Watching the streaming edge (true → false) rather than entry count means a
  // turn that produced only artifacts still counts as "something arrived".
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming && collapsed) setUnread(true);
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, collapsed]);

  useEffect(() => {
    if (!collapsed) setUnread(false);
  }, [collapsed]);

  // Check once per mount: the panel shows a setup prompt instead of failing on first send.
  useEffect(() => {
    let cancelled = false;
    fetchLlmConfig()
      .then(({ config }) => {
        if (cancelled) return;
        setConfigured(Boolean(config?.hasKey));
        setModelLabel(config?.model);
      })
      .catch(() => {
        // A failed check (not logged in yet, server restarting) shouldn't hide the rail;
        // let the send attempt produce the real error.
        if (!cancelled) setConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape does not collapse this rail. It used to, when the assistant was an
  // overlay, and that listener reached every Escape on the page: cancelling a
  // delete, stepping back in the studio, or leaving a half-typed message. The
  // agenda rail does not close on Escape either. The provider-setup dialog
  // still does — that listener lives on the panel.

  // Collapsing destroys the control that had focus, so it would fall to <body>.
  // Hand it back to the strip button that has just appeared.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && collapsed) toggleRef.current?.focus();
    wasOpen.current = !collapsed;
  }, [collapsed]);

  const shownCollapsed = collapsed || suppressed;
  const expandLabel = unread ? 'Expand assistant — new answer' : 'Expand assistant';
  const busy = chat.streaming && shownCollapsed;

  return (
    <BoardRail
      side="right"
      width="wide"
      title="Assistant"
      collapsed={shownCollapsed}
      inert={suppressed}
      onToggle={() => {
        if (suppressed) return;
        setCollapsed((open) => !open);
      }}
      expandLabel={expandLabel}
      collapseLabel="Collapse assistant"
      toggleRef={toggleRef}
      collapsedExtra={<RailMark unread={unread} unconfigured={configured === false} busy={busy} />}
    >
      <AssistantPanel
        chat={chat}
        configured={configured}
        {...(modelLabel ? { modelLabel } : {})}
        {...(questionStatus !== undefined ? { questionStatus } : {})}
        onProviderConfigured={(model) => {
          setConfigured(true);
          setModelLabel(model);
        }}
      />
    </BoardRail>
  );
}

function RailMark({
  unread,
  unconfigured,
  busy,
}: {
  unread: boolean;
  unconfigured: boolean;
  busy: boolean;
}) {
  // Unread beats the setup warning: if an answer is waiting, that is the news.
  if (unread) {
    return (
      <span
        className="size-1.5 rounded-full bg-rt-secondary"
        title="New answer from the assistant"
        aria-hidden="true"
      />
    );
  }
  if (unconfigured) {
    return (
      <span
        className="text-[11px] font-bold leading-none text-rt-secondary-deep"
        title="No AI provider configured"
        aria-hidden="true"
      >
        !
      </span>
    );
  }
  if (busy) {
    return (
      <span
        className="size-1.5 animate-pulse rounded-full bg-rt-cool"
        title="The assistant is replying"
        aria-hidden="true"
      />
    );
  }
  return null;
}
