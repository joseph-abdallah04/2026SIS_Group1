import { useParams } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { CreativeStudio } from '../tools/CreativeStudio';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { VoiceNotice, useVoiceRoom } from '../voice';
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
  // Entering the session view joins the room; leaving it (or ending the
  // session) unmounts this and disconnects — F11's connect/disconnect points.
  // Called before any early return so the room is not torn down and rebuilt
  // every time the board flips between loading, error and loaded.
  const voice = useVoiceRoom(sessionId);

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
      {/* `relative` so VoiceNotice's `absolute` banner positions against this
          frame; `overflow-hidden` so nothing on the board can produce a
          page-level scrollbar; `h-dvh` so mobile browser chrome does not cut
          it off. */}
      <main className="relative h-dvh overflow-hidden">
        <VoiceNotice
          status={voice.status}
          micStatus={voice.micStatus}
          error={voice.error}
          audioBlocked={voice.audioBlocked}
          retry={voice.retry}
          requestMicrophone={voice.requestMicrophone}
          unlockAudio={voice.unlockAudio}
        />
        <PinboardCanvas
          board={board}
          isLive={isLive}
          newItemIds={newItemIds}
          viewerId={viewerId}
          editProposal={editProposal}
          deleteProposal={deleteProposal}
        />
      </main>
      <CreativeStudio />
    </CreativeToolsProvider>
  );
}
