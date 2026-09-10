import { useState } from 'react';
import { SHORTLIST_MIN, type Question, type QuestionStatus, type VotingPhase } from '@roundtable/shared';

import { BoardRail } from '../../components/BoardRail';
import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useSetQuestionPhase, type QuestionPhaseTarget } from '../sessions/useSetQuestionPhase';

interface AgendaPanelProps {
  sessionId: string;
  questions: Question[];
  /** The question the board is showing, from the server (`getActiveQuestion`). */
  activeQuestionId: string | null;
  /** Only the leader gets the phase controls (F25/F26); everyone sees the list. */
  isLeader: boolean;
  /** Hides Skip once the ballot is showing the result (F30). */
  votingPhase?: VotingPhase;
  /**
   * Whether the open discussion question has enough proposals to form a
   * shortlist (`SHORTLIST_MIN`). False disables "Open voting". Omitted when
   * the board is showing a different question, so the server is the remaining
   * gate.
   */
  hasProposals?: boolean;
}

/**
 * The next step the leader can take from each status, and what to call it.
 *
 * A subset of the server's transition table (`setQuestionPhase`) on purpose:
 * this offers the one forward move that makes sense as a button, while the
 * server owns what is *legal*. `answered` and `skipped` are absent because
 * they are terminal, so a finished question shows no controls at all.
 */
const NEXT_PHASE: Partial<Record<QuestionStatus, { status: QuestionPhaseTarget; label: string }>> =
  {
    pending: { status: 'discussion', label: 'Start discussion' },
    discussion: { status: 'voting', label: 'Open voting' },
    // Closing a vote is F30's "End voting" on the ballot, not an agenda
    // shortcut — "Mark answered" would skip the tally and the overlay.
  };

function isComplete(status: QuestionStatus): boolean {
  return status === 'answered' || status === 'skipped';
}

function statusLabel(status: QuestionStatus, votingPhase?: VotingPhase): string | null {
  switch (status) {
    case 'discussion':
      return 'Discussing';
    case 'voting':
      return votingPhase === 'closed' ? 'Results' : 'Voting';
    case 'answered':
      return 'Answered';
    case 'skipped':
      return 'Skipped';
    default:
      return null;
  }
}

/**
 * F24: the ordered question list beside the board, with F25/F26's leader
 * controls. The chrome is `BoardRail`, shared with F13's presence list on the
 * other edge. The leader can click a finished question to put that question's
 * pinboard back on screen without reopening it.
 *
 * Collapse state is local to each participant — the leader collapsing their
 * rail is not an instruction to everyone else.
 */
export function AgendaPanel({
  sessionId,
  questions,
  activeQuestionId,
  isLeader,
  votingPhase,
  hasProposals,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingSkip, setConfirmingSkip] = useState<string | null>(null);
  const {
    setPhase,
    busyQuestionId: phaseBusyId,
    error: phaseError,
  } = useSetQuestionPhase(sessionId);
  const { focus, error: focusError } = useFocusQuestion(sessionId);

  const activeIndex = questions.findIndex((question) => question.id === activeQuestionId);
  const position = activeIndex >= 0 ? `${activeIndex + 1}/${questions.length}` : null;
  const allDone = questions.length > 0 && questions.every((q) => isComplete(q.status));
  const openQuestion = questions.find(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const firstPending = questions.find((question) => question.status === 'pending');
  const error = phaseError ?? focusError;
  const title = `Agenda ${position ?? ''}`;

  return (
    <BoardRail
      side="left"
      title={title}
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand agenda"
      collapseLabel="Collapse agenda"
    >
      {questions.length === 0 ? (
        <p className="py-3 text-[12px] text-rt-ink-muted">No questions on the agenda.</p>
      ) : (
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2">
          {questions.map((question, index) => {
            const isFocused = question.id === activeQuestionId;
            const label = statusLabel(question.status, votingPhase);
            const canSkipVote = question.status !== 'voting' || votingPhase !== 'closed';
            const next = NEXT_PHASE[question.status];
            // Phase controls stay on the question that is actually open, even
            // while the board is looking back at an earlier one. Pending gets
            // "Start discussion" only when nothing is open, on the next one.
            // Voting still offers Skip (an escape hatch); closing the vote is
            // the ballot's "End voting", not an agenda "Mark answered".
            const onThisQuestion = openQuestion
              ? question.id === openQuestion.id
              : firstPending !== undefined && question.id === firstPending.id;
            const stillShortlisting =
              question.status === 'voting' &&
              votingPhase !== 'open' &&
              votingPhase !== 'closed';
            const showControls =
              isLeader &&
              onThisQuestion &&
              (next !== undefined || stillShortlisting || (question.status === 'voting' && canSkipVote));
            const busy = phaseBusyId === question.id;
            const openVotingBlocked = next?.status === 'voting' && hasProposals === false;

            return (
              <li
                key={question.id}
                aria-current={isFocused ? 'step' : undefined}
                className={`rounded-md border px-2.5 py-2 ${
                  isFocused
                    ? 'border-rt-secondary bg-white shadow-sm'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`w-4 shrink-0 text-center text-[11px] font-semibold ${
                      question.status === 'answered'
                        ? 'text-rt-primary-deep'
                        : isFocused
                          ? 'text-rt-primary-deep'
                          : 'text-rt-ink-faint'
                    }`}
                    aria-hidden
                  >
                    {question.status === 'answered' ? '✓' : index + 1}
                  </span>
                  {isLeader ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!isFocused) void focus(question.id);
                      }}
                      className={`text-left text-[12.5px] leading-snug hover:underline ${
                        question.status === 'skipped'
                          ? 'text-rt-ink-faint line-through'
                          : isFocused
                            ? 'font-medium text-rt-ink'
                            : 'text-rt-ink-muted'
                      }`}
                    >
                      {question.text}
                    </button>
                  ) : (
                    <p
                      className={`text-[12.5px] leading-snug ${
                        question.status === 'skipped'
                          ? 'text-rt-ink-faint line-through'
                          : isFocused
                            ? 'font-medium text-rt-ink'
                            : 'text-rt-ink-muted'
                      }`}
                    >
                      {question.text}
                    </p>
                  )}
                </div>

                {label && (
                  <span className="mt-1 ml-[18px] block text-[10px] font-semibold tracking-[0.08em] text-rt-ink-faint uppercase">
                    {label}
                  </span>
                )}

                {showControls && (
                  <div className="mt-2 ml-[18px] flex flex-col gap-1.5">
                    {next ? (
                      <button
                        type="button"
                        onClick={() => void setPhase(question.id, next.status)}
                        disabled={busy || openVotingBlocked}
                        title={
                          openVotingBlocked
                            ? `Add at least ${SHORTLIST_MIN} proposals before opening voting`
                            : undefined
                        }
                        className="self-start rounded-full bg-rt-secondary px-3 py-[5px] text-[11px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:opacity-60 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary"
                      >
                        {busy ? 'Working…' : next.label}
                      </button>
                    ) : null}

                    {stillShortlisting ? (
                      <button
                        type="button"
                        onClick={() => void setPhase(question.id, 'discussion')}
                        disabled={busy}
                        className="self-start text-[11px] font-medium text-rt-ink-muted hover:underline"
                      >
                        Back to discussion
                      </button>
                    ) : null}

                    {canSkipVote ? (
                      confirmingSkip === question.id ? (
                        <span className="flex items-center gap-2 text-[11px]">
                          <span className="text-rt-ink-muted">Skip it?</span>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmingSkip(null);
                              void setPhase(question.id, 'skipped');
                            }}
                            disabled={busy}
                            className="font-semibold text-rt-primary-deep hover:underline"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingSkip(null)}
                            className="text-rt-ink-muted hover:underline"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingSkip(question.id)}
                          className="self-start text-[11px] font-medium text-rt-ink-muted hover:underline"
                        >
                          Skip question
                        </button>
                      )
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {error && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-red-600">
          {error}
        </p>
      )}

      {allDone && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-rt-ink-muted">
          {isLeader
            ? 'Every question is done — end the session when you’re ready.'
            : 'Every question is done.'}
        </p>
      )}
    </BoardRail>
  );
}
