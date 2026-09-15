// The chat rail (F34/F35) — transcript, composer, artifact cards.
//
// The conversation itself does NOT live here. `AssistantBubble` owns it, because F34
// requires the thread to survive collapsing the panel — and this component unmounts when
// the panel closes. The panel is a view over state it does not hold.
//
// Layout lives on the shared `.rt-assistant` shell. This file is the inside of that shell
// once it has grown into the rail.
import { useContext, useEffect, useRef, useState } from 'react';
import type { QuestionStatus } from '@roundtable/shared';

import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { LlmSettingsForm } from '../settings/LlmSettingsForm';
import { AgentActivity } from './AgentActivity';
import { ArtifactCard } from './ArtifactCard';
import { shouldRenderToolEntry } from './assistantActivity';
import { ToolActivity } from './ToolActivity';
import type { AssistantChat, ChatEntry } from './useAssistantChat';

const SUGGESTIONS = [
  'Give me 5 sticky notes for this question',
  'Diagram how these pieces fit together',
  'What do other teams usually do here?',
];

export interface AssistantPanelProps {
  /** Conversation state, owned by AssistantBubble so it outlives this component. */
  chat: AssistantChat;
  onClose: () => void;
  /** null while the config is still loading; false when the user has no provider set up. */
  configured: boolean | null;
  modelLabel?: string;
  /** The pinboard's current phase, so a locked Propose can say why. */
  questionStatus?: QuestionStatus | null;
  /** After in-panel provider setup, so the rail can start chatting without a reload. */
  onProviderConfigured?: (model: string) => void;
  /**
   * True once the shell's clip has finished expanding. The composer waits to
   * take focus until then — focusing mid-morph scrolls the clipped box and
   * hitchs the animation.
   */
  revealed?: boolean;
}

export function AssistantPanel({
  chat,
  onClose,
  configured,
  modelLabel,
  questionStatus,
  onProviderConfigured,
  revealed = true,
}: AssistantPanelProps) {
  const { entries, streaming, thinking, send, stop, clear, setProposeState } = chat;
  const [draft, setDraft] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const composerReady = configured === true;

  // Read the context rather than `useCreativeTools()`: the hook throws outside the
  // provider, and the panel should still render (minus Propose) if it is ever mounted
  // somewhere the board is not.
  const creativeTools = useContext(CreativeToolsContext);
  const canPropose = Boolean(creativeTools?.isLive);

  // Follow the tail as the conversation grows — tokens, a new card, thinking — and on
  // reopen, land at the newest message. Propose is a flag on a card already on screen,
  // and depending on `entries` itself treated pressing it as a new message: the feed
  // jumped to the bottom and took the user with it.
  const followKey = transcriptFollowKey(entries, streaming, thinking);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [followKey]);

  useEffect(() => {
    if (revealed) inputRef.current?.focus();
  }, [revealed]);

  // Escape closes this overlay first, not the whole rail — the bubble also listens.
  useEffect(() => {
    if (!setupOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setSetupOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [setupOpen]);

  useEffect(() => {
    if (!setupOpen) return;
    const root = setupRef.current;
    if (!root) return;

    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [setupOpen]);

  // Grow with the draft up to the CSS max-height, then scroll inside the field.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const submit = () => {
    if (!composerReady || !draft.trim() || streaming) return;
    const message = draft;
    setDraft('');
    void send(message);
  };

  const handlePropose = async (entryId: string, index: number) => {
    const entry = entries[index];
    if (!entry || entry.kind !== 'artifact' || !creativeTools) return;

    setProposeState(entryId, 'sending');
    // `proposeArtifact`, not the editor's `submitArtifact`: every card here proposes on its
    // own, and each needs to hear about its own write rather than read a status the whole
    // board shares.
    const result = await creativeTools.proposeArtifact(entry.artifact);
    setProposeState(
      entryId,
      result.ok ? 'proposed' : 'failed',
      result.ok ? undefined : result.error,
    );
  };

  return (
    <div className="rt-assistant-rail">
      <div className="rt-assistant-body" {...(setupOpen ? { inert: '' } : {})}>
        <header className="rt-assistant-header">
          <div className="min-w-0 flex-1">
            <h2 className="rt-assistant-kicker">Assistant</h2>
            <p className="rt-assistant-meta">
              {modelLabel ? `${modelLabel} · private to you` : 'Private to you'}
            </p>
          </div>
          {entries.length > 0 && (
            <button type="button" onClick={clear} className="rt-assistant-icon-btn">
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="rt-assistant-icon-btn"
          >
            <svg
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div ref={scrollRef} className="rt-assistant-feed">
          {configured === false && <NotConfigured onOpenSetup={() => setSetupOpen(true)} />}

          {configured === true && entries.length === 0 && (
            <EmptyState
              onPick={(text) => {
                setDraft(text);
                inputRef.current?.focus();
              }}
            />
          )}

          {entries.map((entry, index) => {
            switch (entry.kind) {
              case 'user':
                return (
                  <div key={entry.id} className="flex justify-end">
                    <p className="rt-assistant-user">{entry.text}</p>
                  </div>
                );

              case 'assistant':
                return (
                  <p key={entry.id} className="rt-assistant-reply">
                    {entry.text}
                    {entry.streaming && <span className="rt-caret ml-0.5">▍</span>}
                    {entry.interrupted && <span className="rt-assistant-stopped">Stopped</span>}
                  </p>
                );

              case 'tool':
                return shouldRenderToolEntry(entry, streaming) ? (
                  <ToolActivity
                    key={entry.id}
                    toolName={entry.toolName}
                    status={entry.status}
                    {...(entry.summary ? { summary: entry.summary } : {})}
                    {...(entry.results ? { results: entry.results } : {})}
                  />
                ) : null;

              case 'artifact':
                return (
                  <ArtifactCard
                    key={entry.id}
                    artifact={entry.artifact}
                    propose={entry.propose}
                    {...(entry.proposeError ? { proposeError: entry.proposeError } : {})}
                    canPropose={canPropose}
                    {...(questionStatus !== undefined ? { questionStatus } : {})}
                    onPropose={() => void handlePropose(entry.id, index)}
                  />
                );

              case 'error':
                return (
                  <p key={entry.id} className="rt-assistant-error">
                    {entry.message}
                  </p>
                );
            }
          })}
          <AgentActivity entries={entries} streaming={streaming} thinking={thinking} />
        </div>

        <div className="rt-assistant-composer">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — chat convention.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Ask the assistant…"
              disabled={!composerReady}
              className="rt-assistant-input"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                title="Stop generating"
                aria-label="Stop generating"
                aria-busy="true"
                className="rt-assistant-stop"
              >
                <span className="rt-assistant-stop-track" aria-hidden="true">
                  <span className="rt-assistant-stop-arc" />
                </span>
                <span className="rt-assistant-stop-square" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!draft.trim() || !composerReady}
                className="rt-assistant-send"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      {setupOpen && (
        <div
          ref={setupRef}
          className="rt-assistant-setup-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assistant-provider-setup-title"
        >
          <LlmSettingsForm
            variant="panel"
            onCancel={() => setSetupOpen(false)}
            onSaved={({ model }) => {
              setSetupOpen(false);
              onProviderConfigured?.(model);
            }}
          />
        </div>
      )}
    </div>
  );
}

function NotConfigured({ onOpenSetup }: { onOpenSetup: () => void }) {
  return (
    <div className="rt-assistant-setup text-sm">
      <p className="font-semibold">No AI provider set up yet</p>
      <p className="mt-1 text-xs leading-relaxed">
        The assistant runs on your own LLM provider — RoundTable never pays for or sees your
        inference. Add a base URL, API key and model here to switch it on.
      </p>
      <button type="button" onClick={onOpenSetup} className="rt-assistant-setup-cta">
        Set up provider
      </button>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="rt-assistant-empty">
        Hi — I&apos;m your private ideation buddy. I can see the board around you, search the web,
        and draft sticky notes or diagrams you can drop onto the pinboard.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rt-assistant-chip"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What of the transcript the feed should follow.
 *
 * Propose, its error, and whether the board has the item are local flags on a card
 * that is already on screen. Including them here is what yanked the feed to the
 * bottom when the user pressed Propose on a sticky they were looking at.
 */
export function transcriptFollowKey(
  entries: ChatEntry[],
  streaming: boolean,
  thinking: boolean,
): string {
  const parts = entries.map((entry) => {
    switch (entry.kind) {
      case 'artifact':
        return `artifact:${entry.id}`;
      case 'assistant':
        return `assistant:${entry.id}:${entry.text.length}:${entry.streaming ? 1 : 0}:${entry.interrupted ? 1 : 0}`;
      case 'user':
        return `user:${entry.id}:${entry.text.length}`;
      case 'tool':
        return `tool:${entry.id}:${entry.status}:${entry.summary ?? ''}`;
      case 'error':
        return `error:${entry.id}:${entry.message.length}`;
    }
  });
  return `${streaming ? 1 : 0}:${thinking ? 1 : 0}:${parts.join('|')}`;
}
