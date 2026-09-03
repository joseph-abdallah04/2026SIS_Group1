import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { summarizeArtifact, type AssistantContext, type BoardResponse } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { AssistantBubble } from '../assistant';
import { CreativeStudio } from '../tools/CreativeStudio';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { PinboardCanvas } from './PinboardCanvas';
import { usePinboard } from './usePinboard';

function BoardFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-primary-tint bg-rt-primary px-6 py-[13px] text-white">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Loading session…</span>
      </header>
      <div
        className="relative min-h-0 flex-1 bg-rt-surface"
        style={{
          backgroundImage: 'radial-gradient(rgba(140,164,172,0.42) 1.4px, transparent 1.4px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="flex h-full items-center justify-center">{children}</div>
      </div>
    </main>
  );
}

export function SessionPinboard() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const { board, loading, error, reload, propose, isLive, newItemIds } = usePinboard(sessionId);

  /**
   * What the assistant is told about the session (F35). Read fresh on every send, so a
   * proposal that landed seconds ago is already in the agent's view of the board.
   */
  const buildAssistantContext = useCallback((): AssistantContext => describeBoard(board), [board]);

  if (!sessionId) {
    return (
      <main className="flex h-screen items-center justify-center bg-rt-surface">
        <p className="text-rt-ink-muted">Missing session id.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <BoardFrame>
        <p className="text-[13px] text-rt-ink-muted">Loading pinboard…</p>
      </BoardFrame>
    );
  }

  // Only when there is nothing to show: if the REST load failed but the socket
  // snapshot produced a board, the board is what the user wants to see.
  if (error && !board) {
    return (
      <BoardFrame>
        <div className="relative w-[400px] border border-rt-ink bg-rt-surface">
          <span className="pointer-events-none absolute -left-1 -top-1.5 text-[12px] leading-none text-rt-primary">
            +
          </span>
          <span className="pointer-events-none absolute -right-1 -top-1.5 text-[12px] leading-none text-rt-primary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -left-1 text-[12px] leading-none text-rt-primary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -right-1 text-[12px] leading-none text-rt-primary">
            +
          </span>
          <div className="border-b border-rt-tertiary bg-rt-surface-alt px-3.5 py-2 text-[9px] font-semibold tracking-[0.16em] text-rt-ink-faint uppercase">
            Load failed
          </div>
          <div className="p-5 text-center">
            <p className="text-[19px] font-semibold tracking-[-0.01em] text-rt-ink">
              Could not load board
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-rt-ink-muted">{error}</p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-5 bg-rt-primary px-[18px] py-[9px] text-[12px] font-semibold text-white hover:opacity-90 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-primary"
            >
              Retry
            </button>
          </div>
        </div>
      </BoardFrame>
    );
  }

  if (!board) {
    return (
      <BoardFrame>
        <p className="text-[13px] text-rt-ink-muted">Board unavailable.</p>
      </BoardFrame>
    );
  }

  return (
    <CreativeToolsProvider isLive={isLive} proposals={board.items} propose={propose}>
      <main className="h-screen">
        <PinboardCanvas board={board} isLive={isLive} newItemIds={newItemIds} />
      </main>
      <CreativeStudio />
      {/*
        F34 — inside the provider on purpose: Propose from chat (F37) goes through
        `submitArtifact`, the same path the sticky and drawing editors use, so an
        AI-suggested proposal is authored and broadcast exactly like a hand-made one.
      */}
      <AssistantBubble sessionId={sessionId} getContext={buildAssistantContext} />
    </CreativeToolsProvider>
  );
}

/**
 * Turns the board into the compact context the agent reads (F35).
 *
 * Only the most recent handful of proposals are sent: the whole board would dominate the
 * prompt on a busy question, and the tail is what the conversation is usually about.
 */
function describeBoard(board: BoardResponse | null): AssistantContext {
  if (!board) return {};

  const recent = board.items.slice(-8);

  return {
    sessionTitle: board.sessionTitle,
    ...(board.questionText ? { activeQuestion: board.questionText } : {}),
    ...(board.questionId ? { activeQuestionId: board.questionId } : {}),
    ...(board.questionStatus ? { phase: board.questionStatus } : {}),
    recentProposals: recent.map((item) => ({
      id: item.id,
      type: item.type,
      authorName: item.authorName,
      summary: summarizeArtifact(item.artifactJson),
    })),
  };
}
