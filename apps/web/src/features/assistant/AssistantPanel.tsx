// The chat side panel (F34/F35) — transcript, composer, artifact cards.
//
// The conversation itself does NOT live here. `AssistantBubble` owns it, because F34
// requires the thread to survive collapsing the panel — and this component unmounts when
// the panel closes. The panel is a view over state it does not hold.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssistantContext } from '@roundtable/shared';

import { Button } from '../../components/ui/Button';
import { ArtifactCard } from './ArtifactCard';
import { ToolActivity } from './ToolActivity';
import { proposeArtifact } from './propose';
import type { AssistantChat } from './useAssistantChat';

const SUGGESTIONS = [
  'Give me 5 sticky notes for this question',
  'Diagram how these pieces fit together',
  'What do other teams usually do here?',
];

export interface AssistantPanelProps {
  sessionId: string;
  getContext: () => AssistantContext;
  /** Conversation state, owned by AssistantBubble so it outlives this component. */
  chat: AssistantChat;
  onClose: () => void;
  /** null while the config is still loading; false when the user has no provider set up. */
  configured: boolean | null;
  modelLabel?: string;
}

export function AssistantPanel({
  sessionId,
  getContext,
  chat,
  onClose,
  configured,
  modelLabel,
}: AssistantPanelProps) {
  const { entries, streaming, send, stop, clear, setProposeState } = chat;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    if (!entry || entry.kind !== 'artifact') return;
    const questionId = getContext().activeQuestionId;
    if (!questionId) return;

    setProposeState(entryId, 'sending');
    const outcome = await proposeArtifact({ sessionId, questionId, artifact: entry.artifact });
    setProposeState(entryId, outcome.ok ? 'proposed' : 'failed', outcome.error);
  };

  const canPropose = Boolean(getContext().activeQuestionId);

  return (
    <aside
      className="rt-panel pointer-events-auto flex h-[min(680px,calc(100vh-2rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      role="dialog"
      aria-label="AI assistant"
    >
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-slate-800">Assistant</h2>
          <p className="truncate text-xs text-slate-400">
            {modelLabel ? `${modelLabel} · private to you` : 'Private to you'}
          </p>
        </div>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} title="Clear conversation">
            Clear
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close assistant">
          <svg
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
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
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 px-3 py-2 text-sm whitespace-pre-wrap text-white">
                    {entry.text}
                  </p>
                </div>
              );

            case 'assistant':
              return (
                <p
                  key={entry.id}
                  className="max-w-[92%] text-sm leading-relaxed whitespace-pre-wrap text-slate-700"
                >
                  {entry.text}
                  {entry.streaming && <span className="rt-caret ml-0.5 text-indigo-500">▍</span>}
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

      <div className="border-t border-slate-100 p-3">
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
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
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
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">No AI provider set up yet</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">
        The assistant runs on your own LLM provider — RoundTable never pays for or sees your
        inference. Add a base URL, API key and model in settings to switch it on.
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-block text-xs font-semibold text-amber-900 underline underline-offset-2"
      >
        Open settings →
      </Link>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-slate-500">
        Your private ideation buddy. It can see the session around you, search the web, and draft
        sticky notes or diagrams you can drop onto the pinboard.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-200"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
