// The chat rail (F34/F35) — transcript, composer, artifact cards.
//
// The conversation itself does NOT live here. `AssistantBubble` owns it, because F34
// requires the thread to survive collapsing the panel — and this component unmounts when
// the panel closes. The panel is a view over state it does not hold.
//
// Layout lives on the shared `.rt-assistant` shell. This file is the inside of that shell
// once it has grown into the rail.
import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { AgentActivity } from './AgentActivity';
import { ArtifactCard } from './ArtifactCard';
import { shouldRenderToolEntry } from './assistantActivity';
import { ToolActivity } from './ToolActivity';
import type { AssistantChat } from './useAssistantChat';

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
}

export function AssistantPanel({ chat, onClose, configured, modelLabel }: AssistantPanelProps) {
  const { entries, streaming, thinking, send, stop, clear, setProposeState } = chat;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Read the context rather than `useCreativeTools()`: the hook throws outside the
  // provider, and the panel should still render (minus Propose) if it is ever mounted
  // somewhere the board is not.
  const creativeTools = useContext(CreativeToolsContext);
  const canPropose = Boolean(creativeTools?.isLive);

  // Follow the tail as tokens arrive — and on reopen, land at the newest message.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [entries, streaming, thinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Grow with the draft up to the CSS max-height, then scroll inside the field.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const submit = () => {
    if (!draft.trim() || streaming) return;
    const message = draft;
    setDraft('');
    void send(message);
  };

  const handlePropose = async (entryId: string, index: number) => {
    const entry = entries[index];
    if (!entry || entry.kind !== 'artifact' || !creativeTools) return;

    setProposeState(entryId, 'sending');
    const ok = await creativeTools.submitArtifact(entry.artifact);
    setProposeState(
      entryId,
      ok ? 'proposed' : 'failed',
      // Only claim the board rejected it when the board actually said so. A `false` with no
      // error means the write never left the client — another proposal was still in flight.
      ok ? undefined : (creativeTools.submissionError ?? 'Could not send it — try again.'),
    );
  };

  return (
    <div className="rt-assistant-rail">
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
        {configured === false && <NotConfigured />}

        {configured !== false && entries.length === 0 && (
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
            disabled={configured === false}
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
              disabled={!draft.trim() || configured === false}
              className="rt-assistant-send"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="rt-assistant-setup text-sm">
      <p className="font-semibold">No AI provider set up yet</p>
      <p className="mt-1 text-xs leading-relaxed">
        The assistant runs on your own LLM provider — RoundTable never pays for or sees your
        inference. Add a base URL, API key and model in settings to switch it on.
      </p>
      <Link to="/settings" className="mt-2 inline-block underline underline-offset-2">
        Open settings →
      </Link>
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
