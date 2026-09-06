import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Question } from '@roundtable/shared';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { AgendaPanel } from '../agenda/AgendaPanel';
import { SessionJoinNotices } from '../sessions/SessionJoinNotices';
import { CreativeStudio } from '../tools/CreativeStudio';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { PinboardCanvas } from './PinboardCanvas';
import { usePinboard } from './usePinboard';

import { useSessionStore } from '../../lib/sessionStore';
import { api } from '../../lib/api';

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
  isLeader: boolean;
  questions: Question[];
}

export function SessionPinboard({ isLeader, questions }: SessionPinboardProps) {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';

  //
  // ─────────────────────────────────────────────────────────────
  //   PINBOARD FETCH + LOCAL STATE
  // ─────────────────────────────────────────────────────────────
  //
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
    viewerId: viewerIdFromPinboard,
  } = usePinboard(sessionId);

  //
  // ─────────────────────────────────────────────────────────────
  //   GLOBAL SESSION STORE (REALTIME SNAPSHOT)
  // ─────────────────────────────────────────────────────────────
  //
  const shortlist = useSessionStore((s) => s.shortlist);
  const viewerId = useSessionStore((s) => s.viewerId);
  const leaderId = useSessionStore((s) => s.leaderId);
  const status = useSessionStore((s) => s.status);

  const isLeaderFromStore = viewerId === leaderId;
  const isLeaderFinal = isLeader || isLeaderFromStore;
  const votingLocked = status === 'voting';

  //
  // ─────────────────────────────────────────────────────────────
  //   LOCAL SHORTLIST STATE (LEADER ONLY)
  // ─────────────────────────────────────────────────────────────
  //
  const [localShortlist, setLocalShortlist] = useState<string[]>(shortlist);

  useEffect(() => {
    setLocalShortlist(shortlist);
  }, [shortlist]);

function toggleShortlist(id: string) {
  if (!isLeaderFinal || votingLocked) return;

  setLocalShortlist((prev) => {
    const updated = prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id];

    if (window.socket) {
      window.socket.emit("shortlist_updated", {
        sessionId,
        shortlist: updated
      });
    }

    return updated;
  });
}

  async function saveShortlist() {
    await api.post(`/api/sessions/${sessionId}/shortlist`, {
      proposalIds: localShortlist,
    });
  }

  //
  // ─────────────────────────────────────────────────────────────
  //   EXISTING PINBOARD LOADING STATES
  // ─────────────────────────────────────────────────────────────
  //
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

  //
  // ─────────────────────────────────────────────────────────────
  //   MAIN PINBOARD RENDER
  // ─────────────────────────────────────────────────────────────
  //
  return (
    <CreativeToolsProvider
      isLive={isLive && board.questionStatus === 'discussion'}
      proposals={board.items}
      propose={propose}
    >
      <main className="h-dvh overflow-hidden relative">
        <PinboardCanvas
          board={board}
          isLive={isLive}
          newItemIds={newItemIds}
          isLeader={isLeaderFinal}
          viewerId={viewerIdFromPinboard}
          editProposal={editProposal}
          deleteProposal={deleteProposal}
          shortlist={localShortlist}
          onToggleShortlist={toggleShortlist}
          shortlistLocked={votingLocked}
          agenda={
            <AgendaPanel
              sessionId={sessionId}
              questions={questions}
              activeQuestionId={board.questionId}
              isLeader={isLeaderFinal}
            />
          }
        />

        {/* Leader-only shortlist save button */}
        {isLeaderFinal && !votingLocked && (
          <button
            type="button"
            onClick={saveShortlist}
            className="absolute bottom-20 right-9 rounded-full bg-rt-secondary px-4 py-2 text-[13px] font-semibold text-rt-ink hover:bg-rt-secondary-deep"
          >
            Proceed To Vote
          </button>
        )}

        <SessionJoinNotices />
      </main>

      <CreativeStudio />
    </CreativeToolsProvider>
  );
}