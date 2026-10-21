import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { SessionPinboard } from '../pinboard/SessionPinboard';
import { useSidePanel } from '../sidepanel';
import { SessionArchive } from './SessionArchive';
import { useCurrentUserId } from '../../lib/currentUser';
import { SessionDraftPage } from './SessionDraftPage';
import { SessionEndedPage } from './SessionEndedPage';
import { LiveSessionExitGuard } from './LiveSessionExitGuard';
import { useSessionDetail } from './useSessionDetail';
import { useSessionEndedListener } from './useSessionEndedListener';
import { useSessionPhaseListener } from './useSessionPhaseListener';
import { useQuestionAddedListener } from './useQuestionAddedListener';
import { useQuestionUpdatedListener } from './useQuestionUpdatedListener';
import { WaitingRoom } from './WaitingRoom';
import type { WaitingRoomState } from './waitingRoomState';

/**
 * `/sessions/:id` has one route but a render that depends entirely on
 * `session.status` (F06/F08 decision): `draft` is still being set up,
 * `lobby` is joinable-but-not-started, `active` is the live pinboard,
 * `ended` is over. The frontend makes no lifecycle decisions of its own — it
 * just reflects whatever the server says the status is.
 */
export function SessionRouter() {
  const { id } = useParams<{ id: string }>();
  const sessionId = id ?? '';
  const [params] = useSearchParams();
  const {
    session,
    loading,
    error,
    reload,
    refresh,
    applyQuestionPhase,
    applyAddedQuestion,
    applyUpdatedQuestion,
  } = useSessionDetail(sessionId);
  const currentUserId = useCurrentUserId();
  // F32: one listener for both live views, since the waiting room and the
  // pinboard can each be the thing the leader ends from. A refresh, not a
  // reload: the live view stays up until the ended page replaces it.
  useSessionEndedListener(sessionId, refresh);
  // The side panel's open feature, held above both live views so that People
  // (or Chat) open in the waiting room is still open on the board after Start.
  // Shut again for another session.
  const sidePanel = useSidePanel();
  const { close: closeSidePanel } = sidePanel;
  useEffect(() => {
    closeSidePanel();
  }, [sessionId, closeSidePanel]);
  // F25: patch the agenda in place instead of re-fetching, so advancing a
  // question doesn't blank the live view (see `applyQuestionPhase`).
  useSessionPhaseListener(sessionId, applyQuestionPhase);
  useQuestionAddedListener(sessionId, applyAddedQuestion);
  // F41: the leader turning a question's vote on or off.
  useQuestionUpdatedListener(sessionId, applyUpdatedQuestion);

  // The room has just been opened (`JUST_OPENED`): the waiting room flips its
  // code in, once. Taken off the history entry straight away, so a refresh
  // or coming Back shows the code as it is.
  const location = useLocation();
  const navigate = useNavigate();
  const [justOpened, setJustOpened] = useState(false);
  const arrivedOpened = Boolean((location.state as WaitingRoomState | null)?.justOpened);
  useEffect(() => {
    if (!arrivedOpened) return;
    setJustOpened(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [arrivedOpened, navigate, location.pathname]);

  // The meeting ended while this page had it live: the summary marks the
  // moment ("That's a wrap"). Told from the status this page last showed, so
  // opening an ended session later, from the dashboard, never plays it. Kept
  // in state from the render before (React's way of remembering a previous
  // value), so the summary has it from its first render. Once only: looking
  // at the boards and coming back is not arriving again.
  const status = session?.status ?? null;
  const viewingBoards = params.get('view') === 'boards';
  const [seen, setSeen] = useState<{
    sessionId: string;
    status: string | null;
    justEnded: boolean;
  }>({ sessionId, status: null, justEnded: false });
  if (seen.sessionId !== sessionId) {
    setSeen({ sessionId, status, justEnded: false });
  } else if (status !== null && status !== seen.status) {
    const fromLive = seen.status === 'lobby' || seen.status === 'active';
    setSeen({ sessionId, status, justEnded: status === 'ended' && fromLive });
  } else if (seen.justEnded && viewingBoards) {
    setSeen({ ...seen, justEnded: false });
  }

  if (!sessionId) {
    return (
      <main className="flex h-screen items-center justify-center bg-rt-surface">
        <p className="text-rt-ink-muted">Missing session id.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex h-screen items-center justify-center bg-rt-surface">
        <p className="text-[13px] text-rt-ink-muted">Loading session…</p>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-rt-surface">
        <p className="text-[13px] text-rt-ink-muted">{error ?? 'Session not found.'}</p>
        <button
          type="button"
          onClick={() => void reload()}
          className="text-[13px] font-semibold text-rt-primary-deep hover:underline"
        >
          Retry
        </button>
      </main>
    );
  }

  const isLeader = session.leaderId === currentUserId;
  const exitGuard =
    session.status === 'lobby' || session.status === 'active' ? (
      <LiveSessionExitGuard sessionId={sessionId} enabled isLeader={isLeader} onEnded={reload} />
    ) : null;

  switch (session.status) {
    case 'draft':
      return <SessionDraftPage session={session} onOpened={reload} />;
    case 'lobby':
      return (
        <>
          {exitGuard}
          {/* `refresh` keeps this page up until the board is ready to replace
              it, in the same render: the board's room joins then cancel this
              page's deferred leaves, and nobody drops out of the room. */}
          <WaitingRoom
            session={session}
            onLeftLobby={refresh}
            sidePanel={sidePanel}
            justOpened={justOpened}
          />
        </>
      );
    case 'active':
      // `questions` is passed down rather than re-fetched by the board: this
      // component already holds the agenda (F24 renders it), and two fetches
      // of the same list could disagree.
      return (
        <>
          {exitGuard}
          <SessionPinboard
            isLeader={isLeader}
            questions={session.questions}
            joinCode={session.code}
            voiceEnabled={session.voiceEnabled}
            startedAt={session.startedAt}
            sidePanel={sidePanel}
          />
        </>
      );
    case 'ended':
      return viewingBoards ? (
        <SessionArchive session={session} />
      ) : (
        <SessionEndedPage session={session} justEnded={seen.justEnded} />
      );
  }
}
