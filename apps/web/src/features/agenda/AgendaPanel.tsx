import { useState, type FormEvent } from 'react';
import {
  SHORTLIST_MIN,
  type Question,
  type QuestionStatus,
  type VotingPhase,
} from '@roundtable/shared';
import { SESSION_QUESTION_LIMIT, SESSION_QUESTION_TEXT_MAX } from '@roundtable/shared/schemas';

import { BoardRail } from '../../components/BoardRail';
import { BoardLock } from '../pinboard/BoardLock';
import { useAddSessionQuestion } from '../sessions/useAddSessionQuestion';
import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useSetQuestionPhase, type QuestionPhaseTarget } from '../sessions/useSetQuestionPhase';
import { useSetQuestionVoting } from '../sessions/useSetQuestionVoting';
import { VoteToggle } from '../sessions/VoteToggle';
import { AgendaProgress } from './AgendaProgress';
import { summarizeAgenda, stepState } from './agendaSummary';
import {
  AgendaChip,
  AgendaStep,
  AgendaTimeline,
  ViewingChip,
  type AgendaChipTone,
} from './AgendaTimeline';

interface AgendaPanelProps {
  sessionId: string;
  questions: Question[];
  /** The question the board is showing, from the server (`getActiveQuestion`). */
  activeQuestionId: string | null;
  /** Only the leader gets the phase controls (F25/F26); everyone sees the list. */
  isLeader: boolean;
  /** Hides Skip once the ballot shows the result (F30). */
  votingPhase?: VotingPhase;
  /**
   * Whether the open discussion question has enough proposals to form a
   * shortlist (`SHORTLIST_MIN`). False disables "Open voting". Omitted when
   * the board is showing a different question, so the server is the remaining
   * gate.
   */
  hasProposals?: boolean;
  /**
   * The board lock for the question on screen: whether only the leader may
   * move proposals. Shown under it while it is being discussed, the only time
   * anything on it can move. `onToggle` is the leader's alone.
   */
  boardLock?: { locked: boolean; onToggle?: () => Promise<void> };
}

/**
 * The next step the leader can take from a question, and what to call it.
 *
 * A subset of the server's transition tables (`setQuestionPhase`) on purpose:
 * this offers the one forward move that makes sense as a button, while the
 * server owns what is *legal*. `answered` and `skipped` get nothing because
 * they are terminal, so a finished question shows no controls at all.
 *
 * A brainstorm-only question (F41) has no vote to open, so discussion is
 * where it finishes: "Finish discussion" answers it with the board as it is.
 */
function nextPhase(question: Question): { status: QuestionPhaseTarget; label: string } | undefined {
  switch (question.status) {
    case 'pending':
      return { status: 'discussion', label: 'Start discussion' };
    case 'discussion':
      return question.votingEnabled
        ? { status: 'voting', label: 'Open voting' }
        : { status: 'answered', label: 'Finish discussion' };
    // Closing a vote is F30's "End voting" on the ballot, not an agenda
    // shortcut — "Mark answered" would skip the tally and the overlay.
    default:
      return undefined;
  }
}

/** F41: the vote choice can change until voting opens — the server's rule too. */
function canChangeVote(status: QuestionStatus): boolean {
  return status === 'pending' || status === 'discussion';
}

/**
 * Shares its remembered width with the ended session's question list, so a
 * past board opens with the rail the size it was during the session.
 */
const AGENDA_RESIZE = { storageKey: 'agenda', label: 'Resize agenda' };

function statusChip(
  question: Question,
  votingPhase?: VotingPhase,
): { label: string; tone: AgendaChipTone } | null {
  switch (question.status) {
    case 'discussion':
      return { label: question.votingEnabled ? 'Discussing' : 'Brainstorming', tone: 'cool' };
    case 'voting':
      return { label: votingPhase === 'closed' ? 'Results' : 'Voting', tone: 'warm' };
    case 'answered':
      // Nobody chose an answer for a brainstorm — the team discussed it.
      return { label: question.votingEnabled ? 'Answered' : 'Discussed', tone: 'warm' };
    case 'skipped':
      return { label: 'Skipped', tone: 'neutral' };
    default:
      return null;
  }
}

/**
 * F24: the ordered question list beside the board, with F25/F26's leader
 * controls. The chrome is `BoardRail`, shared with the assistant on the other
 * edge; the timeline and progress track are shared with the ended session's
 * question list. The leader can click a finished question to put that
 * question's pinboard back on screen without reopening it.
 *
 * Collapse state and width are local to each participant — the leader
 * collapsing their rail is not an instruction to everyone else.
 */
export function AgendaPanel({
  sessionId,
  questions,
  activeQuestionId,
  isLeader,
  votingPhase,
  hasProposals,
  boardLock,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Held while the leader's lock change is on its way; the lock itself only
  // changes when the room hears about it.
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [confirmingSkip, setConfirmingSkip] = useState<string | null>(null);
  const {
    setPhase,
    busyQuestionId: phaseBusyId,
    error: phaseError,
  } = useSetQuestionPhase(sessionId);
  const {
    setVoting,
    busyQuestionId: votingBusyId,
    error: votingError,
  } = useSetQuestionVoting(sessionId);
  const { focus, error: focusError } = useFocusQuestion(sessionId);
  const { addQuestion, busy: adding, error: addError } = useAddSessionQuestion(sessionId);
  const [draft, setDraft] = useState('');
  const [draftVoting, setDraftVoting] = useState(true);

  const summary = summarizeAgenda(questions);
  const allDone = summary.total > 0 && summary.done === summary.total;
  const openQuestion = questions.find(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const firstPending = questions.find((question) => question.status === 'pending');
  const error = phaseError ?? votingError ?? focusError ?? addError ?? lockError;

  const onToggleLock = boardLock?.onToggle
    ? () => {
        setLockBusy(true);
        setLockError(null);
        boardLock
          .onToggle?.()
          .catch((err: unknown) =>
            setLockError(err instanceof Error ? err.message : 'Could not change the board lock'),
          )
          .finally(() => setLockBusy(false));
      }
    : undefined;
  const canAdd = isLeader && questions.length < SESSION_QUESTION_LIMIT;

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const ok = await addQuestion(draft, draftVoting);
    if (ok) {
      setDraft('');
      setDraftVoting(true);
    }
  }

  return (
    <BoardRail
      side="left"
      title="Agenda"
      collapsed={collapsed}
      onToggle={() => setCollapsed((open) => !open)}
      expandLabel="Expand agenda"
      collapseLabel="Collapse agenda"
      collapsedExtra={<AgendaProgress summary={summary} vertical />}
      resize={AGENDA_RESIZE}
    >
      {questions.length === 0 ? (
        <p className="py-3 text-[12px] text-rt-ink-muted">No questions on the agenda.</p>
      ) : (
        <>
          <AgendaProgress summary={summary} />
          <AgendaTimeline>
            {questions.map((question, index) => {
              const isFocused = question.id === activeQuestionId;
              const isOpen = question.id === openQuestion?.id;
              const canSkipVote = question.status !== 'voting' || votingPhase !== 'closed';
              const next = nextPhase(question);
              // Phase controls stay on the question that is actually open, even
              // while the board is looking back at an earlier one. Pending gets
              // "Start discussion" only when nothing is open, on the next one.
              // Voting still offers Skip (an escape hatch); closing the vote is
              // the ballot's "End voting", not an agenda "Mark answered".
              const onThisQuestion = openQuestion
                ? isOpen
                : firstPending !== undefined && question.id === firstPending.id;
              const stillShortlisting =
                question.status === 'voting' && votingPhase !== 'open' && votingPhase !== 'closed';
              const showControls =
                isLeader &&
                onThisQuestion &&
                (next !== undefined ||
                  stillShortlisting ||
                  (question.status === 'voting' && canSkipVote));
              // One request per question at a time: a phase change and the vote
              // switch (F41) both decide on the same row, so each waits for the
              // other. The server refuses whichever loses a race anyway; this
              // keeps the leader from starting one.
              const phaseBusy = phaseBusyId === question.id;
              const busy = phaseBusy || votingBusyId === question.id;
              const openVotingBlocked = next?.status === 'voting' && hasProposals === false;
              // The board is showing this one while another is still in play:
              // said out loud, so nobody mistakes the old board for the live one.
              const lookingBack = isFocused && openQuestion !== undefined && !isOpen;
              // F41: the leader can flip any not-yet-voting question; everyone
              // else just sees which upcoming ones will not go to a vote.
              const voteControl = !canChangeVote(question.status) ? null : isLeader ? (
                <VoteToggle
                  size="sm"
                  votingEnabled={question.votingEnabled}
                  onChange={(votingEnabled) => void setVoting(question.id, votingEnabled)}
                  label={`Vote on question ${index + 1}`}
                  disabled={busy}
                />
              ) : question.votingEnabled ? null : (
                <AgendaChip tone="outline">No vote</AgendaChip>
              );

              return (
                <AgendaStep
                  key={question.id}
                  number={index + 1}
                  text={question.text}
                  state={stepState(question.status)}
                  focused={isFocused}
                  highlighted={isOpen && !isFocused}
                  last={index === questions.length - 1}
                  onSelect={
                    isLeader
                      ? () => {
                          if (!isFocused) void focus(question.id);
                        }
                      : undefined
                  }
                  status={statusChip(question, votingPhase)}
                  extraChips={
                    lookingBack || voteControl ? (
                      <>
                        {lookingBack ? <ViewingChip /> : null}
                        {voteControl}
                      </>
                    ) : null
                  }
                >
                  {boardLock && isFocused && question.status === 'discussion' ? (
                    <div className="mt-2 flex flex-col">
                      <BoardLock
                        locked={boardLock.locked}
                        onToggle={onToggleLock}
                        busy={lockBusy}
                      />
                    </div>
                  ) : null}

                  {showControls && (
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {next ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void setPhase(question.id, next.status)}
                            disabled={busy || openVotingBlocked}
                            title={
                              openVotingBlocked
                                ? `Add at least ${SHORTLIST_MIN} proposals before opening voting`
                                : undefined
                            }
                            className="w-full rounded-full bg-rt-secondary px-3 py-1.5 text-[11.5px] font-semibold text-rt-ink shadow-sm transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60"
                          >
                            {phaseBusy ? 'Working…' : next.label}
                          </button>
                          {openVotingBlocked ? (
                            <p className="text-[10.5px] leading-snug text-rt-ink-faint">
                              Needs {SHORTLIST_MIN} proposals on the board first
                            </p>
                          ) : null}
                        </>
                      ) : null}

                      {stillShortlisting || canSkipVote ? (
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
                          {stillShortlisting ? (
                            <button
                              type="button"
                              onClick={() => void setPhase(question.id, 'discussion')}
                              disabled={busy}
                              className="font-medium text-rt-ink-muted hover:text-rt-ink hover:underline"
                            >
                              Back to discussion
                            </button>
                          ) : null}

                          {canSkipVote ? (
                            confirmingSkip === question.id ? (
                              <span className="ml-auto flex items-center gap-2">
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
                                className="ml-auto font-medium text-rt-ink-faint hover:text-rt-ink-muted hover:underline"
                              >
                                Skip question
                              </button>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </AgendaStep>
              );
            })}
          </AgendaTimeline>
        </>
      )}

      {canAdd ? (
        <form
          onSubmit={(event) => void onAdd(event)}
          className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2.5"
        >
          <label className="sr-only" htmlFor="agenda-new-question">
            New question
          </label>
          <div className="flex items-center gap-1.5">
            <input
              autoComplete="off"
              id="agenda-new-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a question…"
              maxLength={SESSION_QUESTION_TEXT_MAX}
              disabled={adding}
              className="min-h-8 min-w-0 flex-1 rounded-full border border-rt-tertiary bg-white px-3 text-[12px] text-rt-ink outline-none placeholder:text-rt-ink-faint focus-visible:border-rt-secondary focus-visible:ring-2 focus-visible:ring-rt-secondary/40 disabled:opacity-60"
            />
            <VoteToggle
              size="sm"
              votingEnabled={draftVoting}
              onChange={setDraftVoting}
              label="Vote on the new question"
              disabled={adding}
            />
            <button
              type="submit"
              disabled={adding || draft.trim().length === 0}
              className="min-h-8 shrink-0 rounded-full bg-rt-secondary px-3 text-[11px] font-semibold text-rt-ink transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add'}
            </button>
          </div>
        </form>
      ) : null}

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
