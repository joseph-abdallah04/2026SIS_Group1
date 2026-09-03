import { useParams } from 'react-router-dom';

import { SessionPinboard } from '../pinboard/SessionPinboard';
import { SessionDraftPage } from './SessionDraftPage';
import { useSessionDetail } from './useSessionDetail';
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
  const { session, loading, error, reload } = useSessionDetail(sessionId);

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
      return <WaitingRoom session={session} />;
    case 'active':
      return <SessionPinboard />;
    case 'ended':
      return (
        <main className="flex h-screen items-center justify-center bg-rt-surface">
          <p className="text-[13px] text-rt-ink-muted">This session has ended.</p>
        </main>
      );
  }
}
