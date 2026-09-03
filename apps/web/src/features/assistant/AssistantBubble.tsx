// F34 — the floating assistant bubble and the panel it expands into.
//
// Mounted by `SessionPinboard` inside `CreativeToolsProvider`, so Propose (F37) can use the
// same submit path as the sticky and drawing editors. It sits bottom-right, above the
// creative toolbar (F22), and never covers the board's own controls.
//
// It also owns the conversation. The panel unmounts when collapsed, so state kept there
// would take the thread with it — and F34 requires history to persist across open/close,
// plus an unread dot when an answer lands while you are not looking.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssistantContext } from '@roundtable/shared';

import './assistant.css';
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
}

export function AssistantBubble({ sessionId, getContext }: AssistantBubbleProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>(undefined);

  const resolveContext = useCallback((): AssistantContext => getContext?.() ?? {}, [getContext]);
  const chat = useAssistantChat({ sessionId, getContext: resolveContext });

  // An answer that finished while the panel was shut is the thing the dot marks. Watching
  // the streaming edge (true → false) rather than entry count means a turn that produced
  // only artifacts still counts as "something arrived".
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming && !open) setUnread(true);
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, open]);

  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

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
        // A failed check (not logged in yet, server restarting) shouldn't hide the bubble;
        // let the send attempt produce the real error.
        if (!cancelled) setConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes the panel, like every other overlay.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const label = open
    ? 'Close AI assistant'
    : unread
      ? 'Open AI assistant — new answer'
      : 'Open AI assistant';

  return (
    <div className="pointer-events-none fixed right-4 bottom-24 z-50 flex flex-col items-end gap-3 sm:right-6">
      {open && (
        <AssistantPanel
          chat={chat}
          onClose={() => setOpen(false)}
          configured={configured}
          {...(modelLabel ? { modelLabel } : {})}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        className="rt-bubble pointer-events-auto relative grid size-14 place-items-center rounded-full bg-rt-primary-deep text-white shadow-lg ring-1 ring-white/40 transition hover:bg-rt-ink focus-visible:ring-2 focus-visible:ring-rt-primary-deep focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {/* Pulse only while the agent is working — an idle bubble stays still. */}
        {chat.streaming && (
          <span
            className="rt-bubble-ring absolute inset-0 rounded-full bg-rt-primary"
            aria-hidden="true"
          />
        )}

        <AssistantIcon open={open} />

        {/* Unread beats the setup warning: if an answer is waiting, that is the news. */}
        {!open && unread ? (
          <span
            className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-rt-secondary ring-2 ring-white"
            title="New answer from the assistant"
            aria-hidden="true"
          />
        ) : (
          configured === false && (
            <span
              className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-rt-secondary text-[10px] font-bold text-rt-ink"
              title="No AI provider configured"
              aria-hidden="true"
            >
              !
            </span>
          )
        )}
      </button>
    </div>
  );
}

/** Sparkles when collapsed (F34), a chevron to dismiss when the panel is open. */
function AssistantIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        viewBox="0 0 24 24"
        className="relative size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" className="relative size-7 fill-white" aria-hidden="true">
      <path
        className="rt-sparkle"
        d="M18 5.5l2.2 6.3 6.3 2.2-6.3 2.2L18 22.5l-2.2-6.3-6.3-2.2 6.3-2.2L18 5.5z"
      />
      <path
        className="rt-sparkle rt-sparkle--delayed"
        d="M8.5 19l1.1 3.1 3.1 1.1-3.1 1.1L8.5 27.4l-1.1-3.1-3.1-1.1 3.1-1.1L8.5 19z"
      />
    </svg>
  );
}
