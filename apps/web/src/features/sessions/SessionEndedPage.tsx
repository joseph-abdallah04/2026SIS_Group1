import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, LayoutDashboard, RotateCw } from 'lucide-react';

import { AppPage } from '../../components/AppPage';
import { useCurrentUserId } from '../../lib/currentUser';
import { AppHeader, useMe } from '../dashboard/AppHeader';
import { formatDay } from '../dashboard/SessionItems';
import { DownloadRecapButton } from '../summary/DownloadRecapButton';
import { RECAP_HEADER_BUTTON, RECAP_HEADER_BUTTON_SECONDARY } from '../summary/recapButtons';
import { RecapStatus, useRecapStatus } from '../summary/RecapStatus';
import { SessionSummaryView } from '../summary/SessionSummaryView';
import { useSessionSummary } from '../summary/useSessionSummary';
import type { SessionDetail } from './useSessionDetail';

/** The shape of the recap while it loads, so nothing jumps when it arrives. */
function LoadingRecap() {
  return (
    <div aria-busy="true" className="flex animate-pulse flex-col gap-6">
      <h1 className="sr-only">Loading the summary</h1>
      <div className="flex flex-col gap-3">
        <div className="h-3 w-40 rounded-full bg-rt-surface-alt" />
        <div className="h-10 w-2/3 max-w-md rounded-xl bg-rt-surface-alt" />
        <div className="h-3.5 w-72 max-w-full rounded-full bg-rt-surface-alt" />
      </div>
      <div className="h-56 rounded-3xl bg-rt-surface-alt" />
      <div className="h-72 rounded-3xl bg-rt-surface-alt" />
    </div>
  );
}

/**
 * F32's final screen, now filled in by F31: where every participant lands
 * when the leader ends the session, and what an ended session shows if
 * someone opens its URL later from the dashboard.
 *
 * The session is read-only from here. The recap is the landing view; Review
 * boards opens each question's pinboard without writing anything back. Both
 * that and the PDF sit in the bar, in reach however far down the page is read.
 * The way back to the dashboard is said twice: in the bar's trail, and as the
 * settings page's "Back to dashboard" at the top of the page, where it is
 * looked for first (on a phone it is the only one written out).
 *
 * `justEnded`: the meeting ended while this page had it live, so the summary
 * marks the moment (see `SessionRouter`).
 */
export function SessionEndedPage({
  session,
  justEnded = false,
}: {
  session: SessionDetail;
  justEnded?: boolean;
}) {
  const { summary, loading, error, reload } = useSessionSummary(session.id);
  const viewerId = useCurrentUserId();
  const user = useMe();
  const [, setParams] = useSearchParams();
  // One place for what the page has to say: an export, a copy, a download.
  const { status, report } = useRecapStatus();

  /**
   * The read-only boards, at the question asked for, or the first. Kept the
   * same between renders, since every question card is handed it.
   */
  const questions = session.questions;
  const openBoards = useCallback(
    (questionId?: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', 'boards');
        const first = [...questions].sort((a, b) => a.position - b.position)[0];
        const target = questionId ?? first?.id;
        if (target) next.set('question', target);
        return next;
      });
    },
    [setParams, questions],
  );

  const actions = (
    <>
      <button
        type="button"
        onClick={() => openBoards()}
        aria-label="Review boards"
        title="Review each question’s board"
        className={`${RECAP_HEADER_BUTTON} ${RECAP_HEADER_BUTTON_SECONDARY}`}
      >
        <LayoutDashboard aria-hidden size={15} strokeWidth={2} />
        <span className="hidden sm:inline">Review boards</span>
      </button>
      {summary ? <DownloadRecapButton sessionId={session.id} report={report} /> : null}
    </>
  );

  return (
    <AppPage
      header={
        <AppHeader
          current="Recap"
          user={user}
          status={session.endedAt ? `Ended ${formatDay(session.endedAt)}` : undefined}
          actions={actions}
        />
      }
    >
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to="/dashboard"
          className="-ml-2 flex items-center gap-2 self-start rounded-full px-2 py-1 text-[13.5px] font-medium text-rt-ink-muted hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden size={15} />
          Back to dashboard
        </Link>
        {loading ? <LoadingRecap /> : null}
        {error && !summary ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <h1 className="text-[22px] font-semibold tracking-[-0.01em]">{session.title}</h1>
            <p className="text-[13px] text-red-700">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-rt-tertiary bg-white px-4 text-[13px] font-semibold text-rt-ink hover:bg-rt-surface-alt focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
            >
              <RotateCw aria-hidden size={14} />
              Try again
            </button>
          </div>
        ) : null}
        {summary ? (
          <SessionSummaryView
            summary={summary}
            viewerId={viewerId}
            cardActions
            onStatus={report}
            voiceEnabled={session.voiceEnabled}
            onOpenBoard={openBoards}
            justEnded={justEnded}
          />
        ) : null}
      </div>
      <RecapStatus status={status} />
    </AppPage>
  );
}
