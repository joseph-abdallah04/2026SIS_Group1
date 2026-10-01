import { Link, useSearchParams } from 'react-router-dom';

import { RoundTableLogo } from '../../components/RoundTableLogo';
import { useCurrentUserId } from '../../lib/currentUser';
import { DownloadRecapButton } from '../summary/DownloadRecapButton';
import { SessionSummaryView } from '../summary/SessionSummaryView';
import { useSessionSummary } from '../summary/useSessionSummary';
import type { SessionDetail } from './useSessionDetail';

/**
 * F32's final screen, now filled in by F31: where every participant lands
 * when the leader ends the session, and what an ended session shows if
 * someone opens its URL later from the dashboard.
 *
 * The session is read-only from here. The recap is the landing view; Review
 * boards opens each question's pinboard without writing anything back.
 */
export function SessionEndedPage({ session }: { session: SessionDetail }) {
  const { summary, loading, error } = useSessionSummary(session.id);
  const viewerId = useCurrentUserId();
  const [, setParams] = useSearchParams();

  function openBoards() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'boards');
      const first = [...session.questions].sort((a, b) => a.position - b.position)[0];
      if (first) next.set('question', first.id);
      return next;
    });
  }

  return (
    <main className="flex min-h-screen flex-col bg-rt-surface text-rt-ink">
      <header className="flex shrink-0 items-center gap-4 border-b border-rt-secondary/40 bg-rt-secondary-wash px-6 py-[13px] text-rt-ink">
        <RoundTableLogo />
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Session ended</span>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        {loading ? <p className="text-[13px] text-rt-ink-muted">Loading summary…</p> : null}
        {error && !summary ? (
          <div>
            <h1 className="text-[19px] font-semibold tracking-[-0.01em]">{session.title}</h1>
            <p className="mt-2 text-[13px] text-red-600">{error}</p>
          </div>
        ) : null}
        {summary ? <SessionSummaryView summary={summary} viewerId={viewerId} /> : null}

        <div className="mt-auto flex items-center justify-between gap-4 pt-4">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-[13px] font-semibold text-rt-primary-deep hover:underline"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={openBoards}
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-rt-secondary px-4 text-[13px] font-semibold text-rt-ink shadow-sm transition-colors hover:bg-rt-secondary-deep hover:text-white focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Review boards
            </button>
          </div>
          {summary ? <DownloadRecapButton sessionId={session.id} /> : null}
        </div>
      </div>
    </main>
  );
}
