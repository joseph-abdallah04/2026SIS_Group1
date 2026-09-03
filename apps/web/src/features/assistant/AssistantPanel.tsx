// The chat side panel (F34/F35) — transcript, composer, artifact cards.
//
// The conversation itself does NOT live here. `AssistantBubble` owns it, because F34
// requires the thread to survive collapsing the panel — and this component unmounts when
// the panel closes. The panel is a view over state it does not hold.
import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { CreativeToolsContext } from '../tools/CreativeToolsContext';
import { ArtifactCard } from './ArtifactCard';
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
  const { entries, streaming, send, stop, clear, setProposeState } = chat;
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
  }, [entries]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      ok ? undefined : (creativeTools.submissionError ?? 'The board rejected it.'),
    );
  };

  return (
    <aside
      className="rt-panel pointer-events-auto flex h-[min(680px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-rt-tertiary bg-rt-surface shadow-2xl"
      role="dialog"
      aria-label="AI assistant"
    >
      <header className="flex items-center gap-2 border-b border-rt-primary-tint px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold text-rt-ink">Assistant</h2>
          <p className="truncate text-[11px] text-rt-ink-faint">
            {modelLabel ? `${modelLabel} · private to you` : 'Private to you'}
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="quiet" onClick={clear} className="min-h-8 px-2 text-[12px]">
            Clear
          </Button>
        )}
        <Button
          variant="quiet"
          onClick={onClose}
          aria-label="Close assistant"
          className="min-h-8 px-2"
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-rt-primary-deep px-3 py-2 text-sm whitespace-pre-wrap text-white">
                    {entry.text}
                  </p>
                </div>
              );

            case 'assistant':
              return (
                <p
                  key={entry.id}
                  className="max-w-[92%] text-sm leading-relaxed whitespace-pre-wrap text-rt-ink"
                >
                  {entry.text}
                  {entry.streaming && <span className="rt-caret ml-0.5 text-rt-primary">▍</span>}
                </p>
              );

            case 'tool':
              return (
                <ToolActivity
                  key={entry.id}
                  toolName={entry.toolName}
                  status={entry.status}
                  {...(entry.summary ? { summary: entry.summary } : {})}
                  {...(entry.results ? { results: entry.results } : {})}
                />
              );

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
                <p
                  key={entry.id}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {entry.message}
                </p>
              );
          }
        })}
      </div>

      <div className="border-t border-rt-primary-tint p-3">
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
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg bg-rt-surface px-3 py-2 text-sm text-rt-ink ring-1 ring-rt-tertiary ring-inset placeholder:text-rt-ink-faint focus:ring-2 focus:ring-rt-primary-deep focus:outline-none disabled:bg-rt-surface-alt"
          />
          {streaming ? (
            <Button variant="secondary" onClick={stop} title="Stop generating">
              Stop
            </Button>
          ) : (
            <Button onClick={submit} disabled={!draft.trim() || configured === false}>
              Send
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

function NotConfigured() {
  return (
    <div className="rounded-xl border border-rt-secondary-tint bg-rt-secondary-wash p-3 text-sm text-rt-ink">
      <p className="font-semibold">No AI provider set up yet</p>
      <p className="mt-1 text-xs leading-relaxed text-rt-ink-muted">
        The assistant runs on your own LLM provider — RoundTable never pays for or sees your
        inference. Add a base URL, API key and model in settings to switch it on.
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-block text-xs font-semibold text-rt-secondary-deep underline underline-offset-2"
      >
        Open settings →
      </Link>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-rt-ink-muted">
        Your private ideation buddy. It can see the board around you, search the web, and draft
        sticky notes or diagrams you can drop onto the pinboard.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full bg-rt-primary-tint px-2.5 py-1 text-xs text-rt-ink-muted transition-colors hover:bg-rt-tertiary"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
