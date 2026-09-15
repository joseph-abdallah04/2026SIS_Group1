// F34 — the floating assistant orb and the rail it morphs into.
//
// Mounted by `SessionPinboard` inside `CreativeToolsProvider`, so Propose (F37) can use the
// same submit path as the sticky and drawing editors. It sits on the right edge, from under
// the session header to the bottom inset, with the launch orb in that corner. Zoom lives on
// the other side so the rail can use the full height without covering those controls.
//
// It also owns the conversation. The rail unmounts when collapsed, so state kept there
// would take the thread with it — and F34 requires history to persist across open/close,
// plus an unread dot when an answer lands while you are not looking.
//
// The orb and the rail are the same object: opening uncovers the shell from a circle in the
// corner out to a slim right-hand panel (see assistant.css for why that is a clip and not a
// resize). The launch button is gone while the rail is up; the rail's own X, or Escape,
// closes it.
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ArtifactJson, AssistantContext, QuestionStatus } from '@roundtable/shared';

import './assistant.css';
import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { AssistantPanel } from './AssistantPanel';
import { fetchLlmConfig } from './api';
import { useAssistantChat } from './useAssistantChat';

/**
 * How long the shell takes to expand, in step with `--rt-assistant-expand`.
 *
 * Only a fallback: `transitionend` is what normally releases the transcript, and this covers
 * the cases where it never fires — a reduced-motion user, or a browser that drops the
 * transition because the tab was hidden while it ran.
 */
const EXPAND_MS = 520;

function prefersReducedMotion() {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
   * Hide the rail entirely — used while a voting ballot covers the board, so a
   * z-index fight cannot put the chat on top of the vote.
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
  const [open, setOpen] = useState(false);
  // Distinct from `open`: the panel is mounted as soon as it opens, but stays invisible until
  // the shell has finished growing. Contents appearing inside a panel that is still expanding
  // look half-built.
  const [revealed, setRevealed] = useState(false);
  // Stays mounted through the collapse so the clip-path does not have to rebuild
  // an emptied flex tree on the first closing frame.
  const [railMounted, setRailMounted] = useState(false);
  const [unread, setUnread] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>(undefined);

  const resolveContext = useCallback((): AssistantContext => getContext?.() ?? {}, [getContext]);
  const chat = useAssistantChat({ sessionId, getContext: resolveContext });
  const { syncProposedWithBoard } = chat;
  const creativeTools = useContext(CreativeToolsContext);

  const closePanel = useCallback(() => {
    setOpen(false);
    setRevealed(false);
  }, []);
  const openPanel = useCallback(() => {
    setRailMounted(true);
    setOpen(true);
  }, []);

  // The studio is a page-modal at z-40; the rail is below it. Closing on open is
  // the belt: a leftover open rail must not sit over the editor.
  useEffect(() => {
    if (creativeTools?.activeTool) closePanel();
  }, [closePanel, creativeTools?.activeTool]);

  useEffect(() => {
    if (suppressed) closePanel();
  }, [closePanel, suppressed]);

  useEffect(() => {
    syncProposedWithBoard(boardItems ?? []);
  }, [boardItems, syncProposedWithBoard]);

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

  // Closing hides the transcript at once and lets the shell collapse over an empty panel;
  // opening waits for the expansion to land. Watching the transition rather than trusting a
  // timer keeps the two in step even if the easing or duration changes in the stylesheet.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return;
    }
    setRailMounted(true);
    // No media-query engine means nothing is animating to wait for, which is jsdom and
    // the reduced-motion case both: show the transcript now rather than on a transition
    // that will never end.
    if (prefersReducedMotion()) {
      setRevealed(true);
      return;
    }

    const shell = shellRef.current;
    const timer = window.setTimeout(() => setRevealed(true), EXPAND_MS);
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'clip-path') setRevealed(true);
    };
    shell?.addEventListener('transitionend', onEnd);
    return () => {
      window.clearTimeout(timer);
      shell?.removeEventListener('transitionend', onEnd);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    if (prefersReducedMotion()) {
      setRailMounted(false);
      return;
    }
    const shell = shellRef.current;
    const timer = window.setTimeout(() => setRailMounted(false), EXPAND_MS);
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName === 'clip-path') setRailMounted(false);
    };
    shell?.addEventListener('transitionend', onEnd);
    return () => {
      window.clearTimeout(timer);
      shell?.removeEventListener('transitionend', onEnd);
    };
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
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closePanel, open]);

  // Closing destroys the launch target, so focus would fall to <body> and a keyboard user
  // would lose their place. Hand it back to the orb that has just reappeared.
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) bubbleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const label = unread ? 'Open AI assistant — new answer' : 'Open AI assistant';
  const busy = chat.streaming && !open;

  if (suppressed) return null;

  return (
    <div
      className={`rt-assistant ${open ? 'is-open' : 'is-closed'}${revealed ? ' is-revealed' : ''}${
        busy ? ' is-busy' : ''
      }`}
    >
      {/* Outside the shell, because the shell's clip would cut the ring off. */}
      <div className="rt-assistant-aura" aria-hidden="true">
        <span className="rt-assistant-aura-spin" />
        <span className="rt-assistant-aura-spin rt-assistant-aura-spin--counter" />
        <span className="rt-assistant-aura-glow" />
      </div>

      {/* Always the full rail; `clip-path` decides how much of it you can see. */}
      <div
        ref={shellRef}
        className="rt-assistant-shell"
        {...(open ? { role: 'dialog', 'aria-label': 'AI assistant' } : { 'aria-hidden': true })}
      >
        <div className="rt-assistant-orb" aria-hidden="true">
          <AssistantIcon />
        </div>

        {railMounted && (
          <AssistantPanel
            chat={chat}
            revealed={revealed}
            onClose={closePanel}
            configured={configured}
            {...(modelLabel ? { modelLabel } : {})}
            {...(questionStatus !== undefined ? { questionStatus } : {})}
            onProviderConfigured={(model) => {
              setConfigured(true);
              setModelLabel(model);
            }}
          />
        )}
      </div>

      {!open && (
        <button
          ref={bubbleRef}
          type="button"
          onClick={openPanel}
          aria-label={label}
          aria-haspopup="dialog"
          className="rt-assistant-launch"
        >
          {/* Unread beats the setup warning: if an answer is waiting, that is the news. */}
          {unread ? (
            <span
              className="rt-assistant-badge rt-assistant-badge--dot"
              title="New answer from the assistant"
              aria-hidden="true"
            />
          ) : (
            configured === false && (
              <span
                className="rt-assistant-badge"
                title="No AI provider configured"
                aria-hidden="true"
              >
                !
              </span>
            )
          )}
        </button>
      )}
    </div>
  );
}

function AssistantIcon() {
  return (
    <svg viewBox="0 0 32 32" className="rt-assistant-mark" aria-hidden="true">
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
