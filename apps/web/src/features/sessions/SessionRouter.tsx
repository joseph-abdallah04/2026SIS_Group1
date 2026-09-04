import { useParams } from 'react-router-dom';

import { SessionPinboard } from '../pinboard/SessionPinboard';
import { useCurrentUserId } from '../../lib/currentUser';
import { SessionDraftPage } from './SessionDraftPage';
import { SessionEndedPage } from './SessionEndedPage';
import { useSessionDetail } from './useSessionDetail';
import { useSessionEndedListener } from './useSessionEndedListener';
import { useSessionPhaseListener } from './useSessionPhaseListener';
import { WaitingRoom } from './WaitingRoom';

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
  const { session, loading, error, reload, applyQuestionPhase } = useSessionDetail(sessionId);
  const currentUserId = useCurrentUserId();
  // F32: one listener for both live views, since the waiting room and the
  // pinboard can each be the thing the leader ends from.
  useSessionEndedListener(sessionId, reload);
  // F25: patch the agenda in place instead of re-fetching, so advancing a
  // question doesn't blank the live view (see `applyQuestionPhase`).
  useSessionPhaseListener(sessionId, applyQuestionPhase);

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

  switch (session.status) {
    case 'draft':
      return <SessionDraftPage session={session} onOpened={reload} />;
    case 'lobby':
      return <WaitingRoom session={session} onStarted={reload} />;
    case 'active':
      // `questions` is passed down rather than re-fetched by the board: this
      // component already holds the agenda (F24 renders it), and two fetches
      // of the same list could disagree.
      return (
        <SessionPinboard
          isLeader={session.leaderId === currentUserId}
          questions={session.questions}
        />
      );
    case 'ended':
      return <SessionEndedPage session={session} />;
  }
}
