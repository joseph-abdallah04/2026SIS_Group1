import { useParams } from 'react-router-dom';
import type { Question } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { AgendaPanel } from '../agenda/AgendaPanel';
import { SessionJoinNotices } from '../sessions/SessionJoinNotices';
import { CreativeStudio } from '../tools/CreativeStudio';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { PinboardCanvas } from './PinboardCanvas';
import { usePinboard } from './usePinboard';

function BoardFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-primary px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Loading session…</span>
      </header>
      <div
        className="relative min-h-0 flex-1 bg-rt-surface"
        style={{
          backgroundImage: 'radial-gradient(rgba(224,163,60,0.35) 1.4px, transparent 1.4px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="flex h-full items-center justify-center">{children}</div>
      </div>
    </main>
  );
}

interface SessionPinboardProps {
  /**
   * Decides which of the two exits the header offers: "Leave session" for a
   * member (F07), "End session" for the leader (F32). Required, not
   * defaulted — guessing would silently drop someone's only way out.
   */
  isLeader: boolean;
  /** The agenda F24 renders beside the board, from `SessionRouter`'s fetch. */
  questions: Question[];
}

export function SessionPinboard({ isLeader, questions }: SessionPinboardProps) {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const {
    board,
    loading,
    error,
    reload,
    propose,
    editProposal,
    deleteProposal,
    isLive,
    newItemIds,
    viewerId,
  } = usePinboard(sessionId);

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
          <span className="pointer-events-none absolute -left-1 -top-1.5 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -right-1 -top-1.5 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -left-1 text-[12px] leading-none text-rt-secondary">
            +
          </span>
          <span className="pointer-events-none absolute -bottom-1.5 -right-1 text-[12px] leading-none text-rt-secondary">
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
              className="mt-5 rounded-full bg-rt-secondary px-[18px] py-[9px] text-[12px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
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
    <CreativeToolsProvider
      isLive={isLive && board.questionStatus === 'discussion'}
      proposals={board.items}
      propose={propose}
    >
      {/* `overflow-hidden` so nothing on the board can produce a page-level
          scrollbar; `h-dvh` so mobile browser chrome does not cut it off. */}
      <main className="h-dvh overflow-hidden">
        <PinboardCanvas
          board={board}
          isLive={isLive}
          newItemIds={newItemIds}
          isLeader={isLeader}
          viewerId={viewerId}
          editProposal={editProposal}
          deleteProposal={deleteProposal}
          agenda={
            <AgendaPanel
              sessionId={sessionId}
              questions={questions}
              activeQuestionId={board.questionId}
              isLeader={isLeader}
            />
          }
        />
        <SessionJoinNotices />
      </main>
      <CreativeStudio />
    </CreativeToolsProvider>
  );
}
