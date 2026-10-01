import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BoardResponse, Question } from '@roundtable/shared';

import { useCurrentUserId } from '../../lib/currentUser';
import { PinboardCanvas } from '../pinboard/PinboardCanvas';
import { useArchivedBoard } from '../pinboard/useArchivedBoard';
import { useArchivedOutcomes, type ArchivedVoteOutcome } from '../pinboard/useArchivedOutcomes';
import { CreativeToolsProvider } from '../tools/CreativeToolsProvider';
import { ArchiveQuestionList } from './ArchiveQuestionList';
import type { SessionDetail } from './useSessionDetail';

const NO_NEW_ITEMS = new Set<string>();

function marksForQuestion(outcomes: ArchivedVoteOutcome[] | null, questionId: string | null) {
  const outcome = questionId ? outcomes?.find((item) => item.questionId === questionId) : undefined;
  const hasMarks =
    !!outcome &&
    (outcome.proposalIds.length > 0 ||
      outcome.winnerProposalId !== null ||
      outcome.tiedProposalIds.length > 0);
  if (!outcome || !hasMarks) {
    return { shortlist: [] as string[], resultMarks: {} as Record<string, 'winner' | 'tied'> };
  }

  const resultMarks: Record<string, 'winner' | 'tied'> = {};
  if (outcome.winnerProposalId) resultMarks[outcome.winnerProposalId] = 'winner';
  for (const id of outcome.tiedProposalIds) resultMarks[id] = 'tied';
  return { shortlist: outcome.proposalIds, resultMarks };
}

function placeholder(session: SessionDetail, question: Question | null): BoardResponse {
  return {
    sessionId: session.id,
    sessionTitle: session.title,
    leaderId: session.leaderId,
    questionId: question?.id ?? null,
    questionText: question?.text ?? null,
    questionPosition: question?.position ?? null,
    questionStatus: question?.status ?? null,
    // An ended session's boards are read-only; nothing on them moves.
    boardLocked: true,
    items: [],
    discussionTimer: null,
  };
}

/**
 * An ended session, question by question, with nothing writable.
 *
 * The board is loaded over HTTP for the question this viewer picked. That
 * choice stays in the URL. It is not `currentQuestionId`, so two people
 * reviewing the same session do not move each other's board, and the session
 * row is never updated.
 */
export function SessionArchive({ session }: { session: SessionDetail }) {
  const [params, setParams] = useSearchParams();
  const viewerId = useCurrentUserId();
  const ordered = useMemo(
    () => [...session.questions].sort((a, b) => a.position - b.position),
    [session.questions],
  );
  const requested = params.get('question');
  const selected = ordered.find((question) => question.id === requested) ?? ordered[0] ?? null;
  const { board, loading, error, reload } = useArchivedBoard(session.id, selected?.id ?? null);
  const outcomes = useArchivedOutcomes(session.id);
  const { shortlist, resultMarks } = marksForQuestion(outcomes, selected?.id ?? null);

  useEffect(() => {
    if (!selected) {
      if (requested === null) return;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('question');
          return next;
        },
        { replace: true },
      );
      return;
    }
    if (requested === selected.id) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('view', 'boards');
        next.set('question', selected.id);
        return next;
      },
      { replace: true },
    );
  }, [requested, selected, setParams]);

  function selectQuestion(questionId: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'boards');
      next.set('question', questionId);
      return next;
    });
  }

  function backToSummary() {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('view');
      next.delete('question');
      next.delete('tool');
      return next;
    });
  }

  const ready = board !== null && board.questionId === selected?.id;
  const display = ready && board ? board : placeholder(session, selected);

  const boardOverlay = error ? (
    <div className="flex flex-col items-start gap-2">
      <p className="text-[12px] text-red-600">{error}</p>
      <button
        type="button"
        onClick={() => reload()}
        className="text-[12px] font-semibold text-rt-primary-deep hover:underline"
      >
        Retry
      </button>
    </div>
  ) : loading && !ready ? (
    <p className="text-[12px] font-medium text-rt-ink-muted">Loading pinboard…</p>
  ) : undefined;

  return (
    <main className="relative h-dvh overflow-hidden">
      <CreativeToolsProvider
        sessionId={session.id}
        questionId={selected?.id ?? ''}
        isLive={false}
        viewerId={viewerId}
        proposals={display.items}
        propose={async () => {}}
        editProposal={async () => {}}
      >
        <PinboardCanvas
          board={display}
          isLive={false}
          newItemIds={NO_NEW_ITEMS}
          isLeader={session.leaderId === viewerId}
          viewerId={viewerId}
          editProposal={async () => {}}
          arrangeProposal={async () => {}}
          deleteProposal={async () => {}}
          reactToProposal={async () => {}}
          shortlist={shortlist}
          resultMarks={resultMarks}
          canToggleShortlist={false}
          onToggleShortlist={() => {}}
          readOnly
          boardOverlay={boardOverlay}
          agenda={
            <ArchiveQuestionList
              questions={ordered}
              activeQuestionId={selected?.id ?? null}
              onSelect={selectQuestion}
            />
          }
          archiveActions={
            <button
              type="button"
              onClick={backToSummary}
              className="text-[13px] font-semibold text-rt-primary-deep hover:underline"
            >
              Back to summary
            </button>
          }
        />
      </CreativeToolsProvider>
    </main>
  );
}
