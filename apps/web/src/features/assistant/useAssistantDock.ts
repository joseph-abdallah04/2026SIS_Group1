// F34 — the assistant's conversation, held where it outlives the panel.
//
// The panel unmounts whenever the side panel closes or shows another tab, and
// F34 requires the thread to survive that, with an unread mark when an answer
// lands while the panel is not on screen. So the conversation lives here, in
// the side panel that stays mounted, and `AssistantPanel` is a view over it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArtifactJson, AssistantContext } from '@roundtable/shared';

import { fetchLlmConfig } from './api';
import { useAssistantChat, type AssistantChat } from './useAssistantChat';

export interface UseAssistantDockOptions {
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
  /** The assistant's panel is the one on screen. */
  showing: boolean;
}

export interface AssistantDock {
  chat: AssistantChat;
  /** null while the config is still loading; false when the user has no provider set up. */
  configured: boolean | null;
  modelLabel: string | undefined;
  /** An answer finished while the panel was not on screen. */
  unread: boolean;
  /** Replying while the panel is not on screen. */
  busy: boolean;
  /** After in-panel provider setup, so chatting can start without a reload. */
  onProviderConfigured: (model: string) => void;
}

export function useAssistantDock({
  sessionId,
  getContext,
  boardItems,
  showing,
}: UseAssistantDockOptions): AssistantDock {
  const [unread, setUnread] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState<string | undefined>(undefined);

  const resolveContext = useCallback((): AssistantContext => getContext?.() ?? {}, [getContext]);
  const chat = useAssistantChat({ sessionId, getContext: resolveContext });
  const { syncProposedWithBoard } = chat;

  useEffect(() => {
    syncProposedWithBoard(boardItems ?? []);
  }, [boardItems, syncProposedWithBoard]);

  // An answer that finished while the panel was away is the thing the mark shows.
  // Watching the streaming edge (true → false) rather than entry count means a
  // turn that produced only artifacts still counts as "something arrived".
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !chat.streaming && !showing) setUnread(true);
    wasStreaming.current = chat.streaming;
  }, [chat.streaming, showing]);

  useEffect(() => {
    if (showing) setUnread(false);
  }, [showing]);

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
        // A failed check (not logged in yet, server restarting) shouldn't hide the
        // assistant; let the send attempt produce the real error.
        if (!cancelled) setConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onProviderConfigured = useCallback((model: string) => {
    setConfigured(true);
    setModelLabel(model);
  }, []);

  return {
    chat,
    configured,
    modelLabel,
    unread,
    busy: chat.streaming && !showing,
    onProviderConfigured,
  };
}
