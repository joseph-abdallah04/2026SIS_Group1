import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
  revealInList,
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
   * How many proposals the question in discussion has, for the line under it.
   * Omitted when the board is showing a different question.
   */
  proposalCount?: number;
  /** How far through the open ballot the room is, for the line under it. */
  votes?: { voted: number; voters: number };
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

/** How long a question just added stays tinted, so the room notices it. */
const FRESH_MS = 1500;

function statusChip(
  question: Question,
  votingPhase?: VotingPhase,
): { label: string; tone: AgendaChipTone } | null {
  switch (question.status) {
    case 'discussion':
      return { label: question.votingEnabled ? 'Discussing' : 'Brainstorming', tone: 'live' };
    case 'voting':
      return {
        label:
          votingPhase === 'closed' ? 'Results' : votingPhase === 'open' ? 'Voting' : 'Shortlisting',
        tone: 'live',
      };
    case 'answered':
      // Nobody chose an answer for a brainstorm — the team discussed it.
      return { label: question.votingEnabled ? 'Answered' : 'Discussed', tone: 'done' };
    case 'skipped':
      return { label: 'Skipped', tone: 'neutral' };
    default:
      return null;
  }
}

/** The one quiet line under the question in play. */
function metaLine(
  question: Question,
  votingPhase: VotingPhase | undefined,
  proposalCount: number | undefined,
  votes: { voted: number; voters: number } | undefined,
): string | undefined {
  if (question.status === 'discussion' && proposalCount !== undefined) {
    return `${proposalCount} ${proposalCount === 1 ? 'proposal' : 'proposals'}`;
  }
  if (question.status === 'voting') {
    if (votingPhase === 'open' && votes) return `${votes.voted} of ${votes.voters} voted`;
    if (votingPhase !== 'open' && votingPhase !== 'closed') return 'Picking the shortlist';
  }
  return undefined;
}

/** Why "Open voting" is not ready: how many more proposals the shortlist needs. */
function proposalsShort(proposalCount: number | undefined): string {
  if (proposalCount === undefined) return `Needs ${SHORTLIST_MIN} proposals`;
  const more = Math.max(SHORTLIST_MIN - proposalCount, 1);
  return `${more} more ${more === 1 ? 'proposal' : 'proposals'} needed`;
}

const PRIMARY_BUTTON =
  'w-full rounded-full bg-rt-secondary px-3 py-2.5 text-[13px] font-semibold text-rt-ink shadow-sm transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const SECONDARY_BUTTON =
  'w-full rounded-full border border-rt-tertiary bg-white px-3 py-2 text-[12.5px] font-semibold text-rt-ink-muted transition-colors enabled:hover:border-rt-ink-faint enabled:hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const EYEBROW = 'text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase';

/** A choice in the add-question composer: pressed or not. */
function ComposerChip({
  pressed,
  onClick,
  disabled,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${
        pressed
          ? 'border-rt-secondary/50 bg-rt-secondary-wash text-rt-secondary-deep'
          : 'border-rt-tertiary bg-white text-rt-ink-faint hover:text-rt-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * F24: the ordered question list beside the board, with F25/F26's leader
 * controls. The chrome is `BoardRail`, shared with the assistant on the other
 * edge; the steps and progress header are shared with the ended session's
 * question list.
 *
 * Three zones: the progress header, the list, which scrolls, and — for the
 * leader only — the controls, pinned to the bottom however long the agenda
 * gets. Participants get the same panel without them, so it stays calm.
 *
 * The leader can click a finished question to put that question's pinboard
 * back on screen without reopening it. Collapse state and width are local to
 * each participant — the leader collapsing their rail is not an instruction to
 * everyone else.
 */
export function AgendaPanel({
  sessionId,
  questions,
  activeQuestionId,
  isLeader,
  votingPhase,
  hasProposals,
  proposalCount,
  votes,
  boardLock,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Held while the leader's lock change is on its way; the lock itself only
  // changes when the room hears about it.
  const [lockBusy, setLockBusy] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const [confirmingSkip, setConfirmingSkip] = useState<string | null>(null);
  // An upcoming question the leader has clicked open, to set its vote before
  // it starts. Local: it is the leader looking ahead, not the room's board.
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftVoting, setDraftVoting] = useState(true);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The composer opens at the end of the list, which is often below the fold.
  const composerRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (composing && composerRef.current) revealInList(composerRef.current);
  }, [composing]);

  // Questions that have just arrived — added by the leader, heard by everyone —
  // are tinted for a moment. Nothing is fresh on first sight of the agenda.
  const knownIds = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<readonly string[]>([]);
  useEffect(() => {
    const ids = questions.map((question) => question.id);
    const known = knownIds.current;
    knownIds.current = new Set(ids);
    if (!known) return;
    const added = ids.filter((id) => !known.has(id));
    if (added.length === 0) return;
    setFreshIds(added);
    const fade = window.setTimeout(() => setFreshIds([]), FRESH_MS);
    return () => window.clearTimeout(fade);
  }, [questions]);

  const summary = summarizeAgenda(questions);
  const allDone = summary.total > 0 && summary.done === summary.total;
  const openIndex = questions.findIndex(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const openQuestion = openIndex === -1 ? undefined : questions[openIndex];
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

  // The controls act on the question that is actually open, even while the
  // board is looking back at an earlier one. With nothing open, on the next
  // question to start.
  const controlled = openQuestion ?? firstPending;
  const next = controlled ? nextPhase(controlled) : undefined;
  const canSkip =
    controlled !== undefined && (controlled.status !== 'voting' || votingPhase !== 'closed');
  const stillShortlisting =
    controlled?.status === 'voting' && votingPhase !== 'open' && votingPhase !== 'closed';
  // One request per question at a time: a phase change and the vote switch
  // (F41) both decide on the same question, so each waits for the other. The
  // server refuses whichever loses a race anyway; this keeps the leader from
  // starting one.
  const phaseBusy = controlled !== undefined && phaseBusyId === controlled.id;
  const controlsBusy = phaseBusy || (controlled !== undefined && votingBusyId === controlled.id);
  const openVotingBlocked = next?.status === 'voting' && hasProposals === false;

  function closeComposer() {
    setComposing(false);
    setDraft('');
    setDraftVoting(true);
    addButtonRef.current?.focus();
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const ok = await addQuestion(draft, draftVoting);
    if (ok) closeComposer();
  }

  const skipControl =
    controlled && canSkip ? (
      confirmingSkip === controlled.id ? (
        <div className="flex min-h-9 items-center justify-center gap-3 text-[12px]">
          <span className="text-rt-ink-muted">Skip it?</span>
          <button
            type="button"
            onClick={() => {
              setConfirmingSkip(null);
              void setPhase(controlled.id, 'skipped');
            }}
            disabled={controlsBusy}
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
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingSkip(controlled.id)}
          className={SECONDARY_BUTTON}
        >
          Skip question
        </button>
      )
    ) : null;

  const footer = isLeader ? (
    <div className="-mx-3 flex shrink-0 flex-col gap-2.5 border-t border-rt-tertiary px-3 pt-3 pb-3.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className={EYEBROW}>Leader controls</span>
        {canAdd ? (
          composing ? (
            <span className="text-[11.5px] font-medium text-rt-ink-faint">Adding…</span>
          ) : (
            <button
              ref={addButtonRef}
              type="button"
              onClick={() => setComposing(true)}
              className="rounded-sm text-[11.5px] font-semibold text-rt-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary"
            >
              + Add question
            </button>
          )
        ) : null}
      </div>

      {composing ? (
        <>
          <button
            type="submit"
            form="agenda-add-question"
            disabled={adding || draft.trim().length === 0}
            className={PRIMARY_BUTTON}
          >
            {adding ? 'Adding…' : 'Add to agenda'}
          </button>
          <button
            type="button"
            onClick={closeComposer}
            disabled={adding}
            className={SECONDARY_BUTTON}
          >
            Cancel
          </button>
        </>
      ) : allDone ? (
        <p className="text-[12px] leading-snug text-rt-ink-muted">
          Every question is done — end the session when you’re ready.
        </p>
      ) : (
        <>
          {next ? (
            <button
              type="button"
              onClick={() => controlled && void setPhase(controlled.id, next.status)}
              disabled={controlsBusy || openVotingBlocked}
              // Named for what it does; why it cannot yet is its description,
              // read out after the name.
              aria-label={openVotingBlocked ? next.label : undefined}
              aria-describedby={openVotingBlocked ? 'agenda-open-voting-why' : undefined}
              className={PRIMARY_BUTTON}
            >
              {phaseBusy ? (
                'Working…'
              ) : openVotingBlocked ? (
                // The reason on the button that cannot be pressed, counting
                // down as proposals arrive, rather than in a line elsewhere.
                <span className="flex flex-col items-center leading-tight">
                  {next.label}
                  <span
                    id="agenda-open-voting-why"
                    className="mt-0.5 text-[11px] font-medium text-rt-ink/70"
                  >
                    {proposalsShort(proposalCount)}
                  </span>
                </span>
              ) : (
                next.label
              )}
            </button>
          ) : null}
          {stillShortlisting ? (
            <button
              type="button"
              onClick={() => controlled && void setPhase(controlled.id, 'discussion')}
              disabled={controlsBusy}
              className={SECONDARY_BUTTON}
            >
              Back to discussion
            </button>
          ) : null}
          {skipControl}
        </>
      )}
    </div>
  ) : null;

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
      subheader={
        questions.length > 0 ? (
          <AgendaProgress
            summary={summary}
            current={openIndex === -1 ? undefined : openIndex + 1}
          />
        ) : null
      }
    >
      {questions.length === 0 && !composing ? (
        <p className="flex-1 py-3 text-[12px] text-rt-ink-muted">No questions on the agenda.</p>
      ) : (
        <AgendaTimeline>
          {questions.map((question, index) => {
            const isFocused = question.id === activeQuestionId;
            const isOpen = question.id === openQuestion?.id;
            // The board is showing this one while another is still in play:
            // said out loud, so nobody mistakes the old board for the live one.
            const lookingBack = isFocused && openQuestion !== undefined && !isOpen;
            const busy = phaseBusyId === question.id || votingBusyId === question.id;
            // A question still to come, other than the one the controls act
            // on: the leader's click opens it here rather than putting its
            // empty board up for everyone.
            const opensInPlace =
              isLeader &&
              question.status === 'pending' &&
              !isFocused &&
              question.id !== controlled?.id;
            const isExpanded = opensInPlace && expandedId === question.id;
            // F41: the leader flips the vote on the question the controls act
            // on — the open one, or the next to start — and on any question
            // still to come once clicked open, so the rows stay compact. A
            // question set to no vote says so in the list for everyone.
            const canFlipVote = isLeader && (question.id === controlled?.id || isExpanded);
            const voteControl = !canChangeVote(question.status) ? null : canFlipVote ? (
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
                fresh={freshIds.includes(question.id)}
                // The composer is the next step once it is open, so the line
                // runs on to it.
                last={index === questions.length - 1 && !composing}
                expanded={opensInPlace ? isExpanded : undefined}
                onSelect={
                  !isLeader
                    ? undefined
                    : opensInPlace
                      ? () => setExpandedId((open) => (open === question.id ? null : question.id))
                      : () => {
                          if (!isFocused) void focus(question.id);
                        }
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
                meta={isOpen ? metaLine(question, votingPhase, proposalCount, votes) : undefined}
              >
                {boardLock && isFocused && question.status === 'discussion' ? (
                  <div className="mt-2.5 flex flex-col">
                    <BoardLock locked={boardLock.locked} onToggle={onToggleLock} busy={lockBusy} />
                  </div>
                ) : null}
              </AgendaStep>
            );
          })}

          {composing ? (
            <li
              ref={composerRef}
              className="rounded-2xl border border-rt-secondary bg-white px-2.5 py-2 shadow-[0_0_0_3px_var(--color-rt-secondary-wash)]"
            >
              <form
                id="agenda-add-question"
                onSubmit={(event) => void onAdd(event)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-rt-secondary text-[10px] font-semibold text-rt-secondary-deep tabular-nums"
                  >
                    {questions.length + 1}
                  </span>
                  <label className="sr-only" htmlFor="agenda-new-question">
                    New question
                  </label>
                  <input
                    autoFocus
                    autoComplete="off"
                    id="agenda-new-question"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        closeComposer();
                      }
                    }}
                    placeholder="Type a question…"
                    maxLength={SESSION_QUESTION_TEXT_MAX}
                    disabled={adding}
                    className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-rt-ink outline-none placeholder:font-normal placeholder:text-rt-ink-faint disabled:opacity-60"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 pl-[30px]">
                  <ComposerChip
                    pressed={draftVoting}
                    onClick={() => setDraftVoting(true)}
                    disabled={adding}
                  >
                    Vote
                  </ComposerChip>
                  <ComposerChip
                    pressed={!draftVoting}
                    onClick={() => setDraftVoting(false)}
                    disabled={adding}
                  >
                    Brainstorm
                  </ComposerChip>
                </div>
              </form>
            </li>
          ) : null}
        </AgendaTimeline>
      )}

      {error && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-red-600">
          {error}
        </p>
      )}

      {allDone && !isLeader && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2.5 text-[11.5px] text-rt-ink-muted">
          Every question is done.
        </p>
      )}

      {footer}
    </BoardRail>
  );
}
