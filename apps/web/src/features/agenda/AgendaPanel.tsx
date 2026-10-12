import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Lightbulb, ListChecks, Pencil, Plus, SkipForward } from 'lucide-react';
import {
  SHORTLIST_MIN,
  type Question,
  type QuestionStatus,
  type VotingPhase,
} from '@roundtable/shared';
import { SESSION_QUESTION_LIMIT, SESSION_QUESTION_TEXT_MAX } from '@roundtable/shared/schemas';

import { BoardRail } from '../../components/BoardRail';
import { PhaseTimer } from '../../components/PhaseTimer';
import type { ProposalMenuItem } from '../pinboard/ProposalActionsMenu';
import { useAddSessionQuestion } from '../sessions/useAddSessionQuestion';
import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useMoveQuestion } from '../sessions/useMoveQuestion';
import { useSetQuestionPhase, type QuestionPhaseTarget } from '../sessions/useSetQuestionPhase';
import { useSetQuestionText } from '../sessions/useSetQuestionText';
import { useSetQuestionVoting } from '../sessions/useSetQuestionVoting';
import { AgendaProgress } from './AgendaProgress';
import { AgendaRowMenu } from './AgendaRowMenu';
import { summarizeAgenda, stepState } from './agendaSummary';
import {
  AgendaChip,
  AgendaStep,
  AgendaTimeline,
  revealInList,
  ViewingChip,
  type AgendaChipTone,
} from './AgendaTimeline';
import { SkipConfirm } from './SkipConfirm';

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
  /** How many people are in the room, for the line under the question in play. */
  peopleCount?: number;
  /** The discussion clock of the question the board is showing, if it has one. */
  timer?: { questionId: string; startedAt: string; durationSeconds: number } | null;
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
    case 'pending':
      return null;
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
  }
}

/** The one quiet line under the question in play: how it is going, and who is here. */
function metaLine(
  question: Question,
  votingPhase: VotingPhase | undefined,
  proposalCount: number | undefined,
  votes: { voted: number; voters: number } | undefined,
  peopleCount: number | undefined,
): string | undefined {
  const parts: string[] = [];
  if (question.status === 'discussion' && proposalCount !== undefined) {
    parts.push(`${proposalCount} ${proposalCount === 1 ? 'proposal' : 'proposals'}`);
  }
  if (question.status === 'voting' && votingPhase === 'open' && votes) {
    parts.push(`${votes.voted} of ${votes.voters} voted`);
  }
  if (question.status !== 'pending' && peopleCount) {
    parts.push(`${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** Why "Open voting" is not ready: how many more proposals the shortlist needs. */
function proposalsShort(proposalCount: number | undefined): string {
  if (proposalCount === undefined) return `Needs ${SHORTLIST_MIN} proposals`;
  const more = Math.max(SHORTLIST_MIN - proposalCount, 1);
  return `${more} more ${more === 1 ? 'proposal' : 'proposals'} needed`;
}

/** Whether a key press landed somewhere that takes text of its own. */
function inTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

/** "⌘ Enter" on a Mac, "Ctrl+Enter" everywhere else. */
function shortcutLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘ Enter'
    : 'Ctrl+Enter';
}

const PRIMARY_BUTTON =
  'min-h-9 min-w-0 flex-1 rounded-full bg-rt-secondary px-3 py-1.5 text-[12.5px] font-semibold text-rt-ink shadow-sm transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-9 min-w-0 flex-1 rounded-full border border-rt-tertiary bg-white px-3 py-1.5 text-[12px] font-semibold text-rt-ink-muted transition-colors enabled:hover:border-rt-ink-faint enabled:hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const SMALL_PRIMARY =
  'rounded-full bg-rt-secondary px-3 py-1 text-[11.5px] font-semibold text-rt-ink transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-50';
const SMALL_TEXT_BUTTON =
  'rounded-full px-2 py-1 text-[11.5px] font-medium text-rt-ink-muted hover:text-rt-ink hover:underline';
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

/** The exception worth marking: a question that will not go to a vote. */
function BrainstormChip() {
  return (
    <AgendaChip tone="outline" icon={<Lightbulb aria-hidden size={11} strokeWidth={2.25} />}>
      Brainstorm
    </AgendaChip>
  );
}

/**
 * F24: the ordered question list beside the board, with F25/F26's leader
 * controls. The chrome is `BoardRail`, shared with the assistant on the other
 * edge; the steps and progress header are shared with the ended session's
 * question list.
 *
 * The question the room is on — the one in play, or the next to start when
 * nothing is — is a card, and everything the leader does with it is on that
 * card: its one primary step, and a ⋯ beside it for the rest (skipping it,
 * the vote switch). There is no separate control panel to connect it to. Each question still to come has its own ⋯ for what can be set before it
 * starts: the vote, its wording, its place in the agenda, skipping it ahead.
 * The agenda grows from its end: "Add question" is its last row, and the +
 * in the header opens the same place from wherever the list is scrolled.
 *
 * Participants see the same card and list with none of the controls. The
 * leader can click a finished question to put that question's pinboard back
 * on screen without reopening it. Collapse state and width are local to each
 * participant.
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
  peopleCount,
  timer,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // The question being confirmed for skipping: the card's, or one further down.
  const [skippingId, setSkippingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
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
  const { setText, busyQuestionId: textBusyId, error: textError } = useSetQuestionText(sessionId);
  const { move, busyQuestionId: moveBusyId, error: moveError } = useMoveQuestion(sessionId);
  const { focus, error: focusError } = useFocusQuestion(sessionId);
  const { addQuestion, busy: adding, error: addError } = useAddSessionQuestion(sessionId);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftVoting, setDraftVoting] = useState(true);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // The composer opens at the end of the list, which is often below the fold —
  // and from the header's +, often far from where the pointer is.
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
  const error = phaseError ?? votingError ?? textError ?? moveError ?? focusError ?? addError;
  const canAdd = isLeader && questions.length < SESSION_QUESTION_LIMIT;

  // The card is the question the room is on: the one actually open, even
  // while the board looks back at an earlier one, or the next to start.
  const controlled = openQuestion ?? firstPending;
  // The question that follows it, marked so the room can see what is coming.
  const upNext = openQuestion ? firstPending : undefined;
  const next = controlled ? nextPhase(controlled) : undefined;
  const canSkip =
    controlled !== undefined && (controlled.status !== 'voting' || votingPhase !== 'closed');
  const shortlisting =
    controlled?.status === 'voting' && votingPhase !== 'open' && votingPhase !== 'closed';
  const balloting = controlled?.status === 'voting' && votingPhase === 'open';
  // One request per question at a time: a phase change and the vote switch
  // (F41) both decide on the same question, so each waits for the other. The
  // server refuses whichever loses a race anyway; this keeps the leader from
  // starting one.
  const phaseBusy = controlled !== undefined && phaseBusyId === controlled.id;
  const controlsBusy = phaseBusy || (controlled !== undefined && votingBusyId === controlled.id);
  const openVotingBlocked = next?.status === 'voting' && hasProposals === false;
  const primaryReady =
    isLeader &&
    next !== undefined &&
    !controlsBusy &&
    !openVotingBlocked &&
    skippingId === null &&
    !composing &&
    !editing &&
    !allDone;

  // The leader's shortcut for the card's one primary step: facilitators
  // sharing their screen keep their hands on the keyboard. Never from inside a
  // text field — the sticky editor's own Ctrl+Enter proposes — or under a
  // dialog.
  const pressPrimary = useRef<() => void>(() => {});
  pressPrimary.current = () => {
    if (primaryReady && controlled && next) void setPhase(controlled.id, next.status);
  };
  useEffect(() => {
    if (!isLeader) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
      if (event.defaultPrevented || inTextField(event.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      pressPrimary.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isLeader]);

  function closeComposer() {
    setComposing(false);
    setDraft('');
    setDraftVoting(true);
  }

  // Back to "Add question" once the composer is put away, so the keyboard
  // stays where it was.
  const wasComposing = useRef(false);
  useEffect(() => {
    if (wasComposing.current && !composing) addButtonRef.current?.focus();
    wasComposing.current = composing;
  }, [composing]);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const ok = await addQuestion(draft, draftVoting);
    if (ok) closeComposer();
  }

  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const text = editing.draft.trim();
    const current = questions.find((question) => question.id === editing.id);
    if (!text || text === current?.text) {
      setEditing(null);
      return;
    }
    if (await setText(editing.id, text)) setEditing(null);
  }

  async function onSkip(question: Question) {
    if (await setPhase(question.id, 'skipped')) setSkippingId(null);
  }

  /**
   * What the leader can do to a question beyond its primary step: the vote
   * while it can still change, its wording and place while it has not
   * started, and skipping it.
   */
  function menuItems(question: Question, index: number, skippable: boolean): ProposalMenuItem[] {
    const items: ProposalMenuItem[] = [];
    if (canChangeVote(question.status)) {
      items.push({
        id: 'vote',
        label: question.votingEnabled ? 'Make brainstorm only' : 'Put to a vote',
        icon: question.votingEnabled ? Lightbulb : ListChecks,
        onSelect: () => void setVoting(question.id, !question.votingEnabled),
        // Waits while a phase change or another switch on it is on its way.
        disabled: phaseBusyId === question.id || votingBusyId === question.id,
      });
    }
    if (question.status === 'pending') {
      items.push({
        id: 'edit',
        label: 'Edit question',
        icon: Pencil,
        onSelect: () => setEditing({ id: question.id, draft: question.text }),
      });
      // Only past another question that has not started: what has happened is
      // the record so far, and nothing moves above it.
      if (questions[index - 1]?.status === 'pending') {
        items.push({
          id: 'up',
          label: 'Move up',
          icon: ArrowUp,
          onSelect: () => void move(question.id, 'up'),
        });
      }
      if (questions[index + 1]?.status === 'pending') {
        items.push({
          id: 'down',
          label: 'Move down',
          icon: ArrowDown,
          onSelect: () => void move(question.id, 'down'),
        });
      }
    }
    if (skippable) {
      items.push({
        id: 'skip',
        label: 'Skip question…',
        icon: SkipForward,
        onSelect: () => setSkippingId(question.id),
      });
    }
    return items;
  }

  function editForm(question: Question, index: number, busy: boolean) {
    if (editing?.id !== question.id) return undefined;
    return (
      <form onSubmit={(event) => void onSaveEdit(event)} className="flex flex-col gap-1.5">
        <label className="sr-only" htmlFor={`agenda-edit-${question.id}`}>
          Question {index + 1}
        </label>
        <input
          autoFocus
          autoComplete="off"
          id={`agenda-edit-${question.id}`}
          value={editing.draft}
          onChange={(event) => setEditing({ id: question.id, draft: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(null);
            }
          }}
          maxLength={SESSION_QUESTION_TEXT_MAX}
          disabled={busy}
          className="min-w-0 bg-transparent text-[12.5px] font-medium text-rt-ink outline-none disabled:opacity-60"
        />
        <div className="flex items-center gap-1">
          <button
            type="submit"
            disabled={busy || editing.draft.trim().length === 0}
            className={SMALL_PRIMARY}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(null)} className={SMALL_TEXT_BUTTON}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  /** The leader's controls on the card: the one primary step and a ⋯ for the rest. */
  function cardControls(question: Question, index: number) {
    const items = menuItems(question, index, canSkip);
    const menu =
      items.length > 0 ? (
        <AgendaRowMenu variant="round" label={`Question ${index + 1} options`} items={items} />
      ) : null;
    const notice = shortlisting
      ? // The shortlist is picked on the board, and its "Start vote" is there
        // with it: the card steps aside rather than offering a second button.
        'Picking the shortlist on the board.'
      : balloting
        ? 'Voting is open on the ballot.'
        : null;

    return (
      <div className="mt-3 flex flex-col gap-2">
        {notice ? <p className="text-[11.5px] leading-snug text-rt-ink-muted">{notice}</p> : null}
        {next || shortlisting || menu ? (
          <div className="flex items-center gap-2">
            {next ? (
              <button
                type="button"
                onClick={() => void setPhase(question.id, next.status)}
                disabled={controlsBusy || openVotingBlocked}
                // Named for what it does; why it cannot yet is its description,
                // read out after the name.
                aria-label={openVotingBlocked ? next.label : undefined}
                aria-describedby={openVotingBlocked ? 'agenda-open-voting-why' : undefined}
                aria-keyshortcuts="Control+Enter Meta+Enter"
                title={openVotingBlocked ? undefined : `${next.label} (${shortcutLabel()})`}
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
            ) : shortlisting ? (
              <button
                type="button"
                onClick={() => void setPhase(question.id, 'discussion')}
                disabled={controlsBusy}
                className={SECONDARY_BUTTON}
              >
                Back to discussion
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {menu}
          </div>
        ) : null}
      </div>
    );
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
      headerAction={
        canAdd ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            disabled={composing}
            aria-label="Add a question"
            title="Add a question"
            className="inline-flex size-7 items-center justify-center rounded-full text-rt-ink-muted transition-colors hover:bg-rt-ink/[0.06] hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-40"
          >
            <Plus aria-hidden="true" size={15} strokeWidth={2.25} />
          </button>
        ) : undefined
      }
      subheader={
        questions.length > 0 ? (
          <AgendaProgress
            summary={summary}
            current={openIndex === -1 ? undefined : openIndex + 1}
          />
        ) : null
      }
    >
      {questions.length === 0 && !canAdd ? (
        <p className="flex-1 py-3 text-[12px] text-rt-ink-muted">No questions on the agenda.</p>
      ) : (
        <AgendaTimeline>
          {questions.map((question, index) => {
            const isCard = question.id === controlled?.id;
            const isFocused = question.id === activeQuestionId;
            const isPending = question.status === 'pending';
            // The board is showing this one rather than the question the room
            // is on: said out loud, so nobody mistakes the old board for the
            // live one.
            const lookingBack = isFocused && !isCard;
            const busy =
              phaseBusyId === question.id ||
              votingBusyId === question.id ||
              textBusyId === question.id ||
              moveBusyId === question.id;
            // Only before it starts: once under way its status already says
            // "Brainstorming", and a second chip would repeat it.
            const brainstorm = !question.votingEnabled && isPending ? <BrainstormChip /> : null;
            const status = statusChip(question, votingPhase);
            const skipPicker =
              isLeader && skippingId === question.id ? (
                <div className="mt-3">
                  <SkipConfirm
                    questionNumber={index + 1}
                    busy={phaseBusyId === question.id}
                    onSkip={() => void onSkip(question)}
                    onCancel={() => setSkippingId(null)}
                  />
                </div>
              ) : null;

            // The card says where the room is: its status and clock on top,
            // the question, how it is going, then what the leader can do.
            const cardPrefix = isCard ? (
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1">
                  {status ? (
                    <AgendaChip tone={status.tone}>{status.label}</AgendaChip>
                  ) : (
                    <AgendaChip tone="neutral">Up next</AgendaChip>
                  )}
                  {brainstorm}
                </span>
                {timer && timer.questionId === question.id && question.status !== 'pending' ? (
                  <PhaseTimer
                    compact
                    startedAt={timer.startedAt}
                    durationSeconds={timer.durationSeconds}
                    allowOvertime
                    label="Discussion"
                  />
                ) : null}
              </div>
            ) : upNext?.id === question.id ? (
              <span className={`${EYEBROW} mb-0.5`}>Up next</span>
            ) : null;

            return (
              <AgendaStep
                key={question.id}
                number={index + 1}
                text={question.text}
                state={stepState(question.status)}
                focused={isCard}
                highlighted={lookingBack}
                fresh={freshIds.includes(question.id)}
                // The line stops at the last question; it runs on only to a
                // question being written, which has its own numbered node.
                last={index === questions.length - 1 && !composing}
                prefix={cardPrefix}
                // A question still to come has no board worth putting up yet;
                // its settings are in its ⋯, not behind its text.
                onSelect={
                  isLeader && !isPending
                    ? () => {
                        if (!isFocused) void focus(question.id);
                      }
                    : undefined
                }
                // On the card the status is on top; elsewhere it is under the
                // text, and a finished row leaves it to its node.
                status={isCard ? null : status}
                extraChips={
                  !isCard && (lookingBack || brainstorm) ? (
                    <>
                      {lookingBack ? <ViewingChip /> : null}
                      {brainstorm}
                    </>
                  ) : null
                }
                meta={
                  isCard
                    ? metaLine(question, votingPhase, proposalCount, votes, peopleCount)
                    : undefined
                }
                note={
                  question.status === 'skipped' ? (question.skipReason ?? undefined) : undefined
                }
                action={
                  isLeader && isPending && !isCard && skippingId !== question.id ? (
                    <AgendaRowMenu
                      label={`Question ${index + 1} options`}
                      items={menuItems(question, index, true)}
                    />
                  ) : undefined
                }
                textSlot={editForm(question, index, busy)}
              >
                {skipPicker ?? (isCard && isLeader ? cardControls(question, index) : null)}
              </AgendaStep>
            );
          })}

          {composing ? (
            <li
              ref={composerRef}
              className="rounded-2xl border border-rt-secondary bg-white px-2.5 py-2 shadow-[0_0_0_3px_var(--color-rt-secondary-wash)]"
            >
              <form onSubmit={(event) => void onAdd(event)} className="flex flex-col gap-2">
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
                <div className="flex flex-wrap items-center gap-1.5 pl-7.5">
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
                <div className="flex items-center gap-1 pl-7.5">
                  <button
                    type="submit"
                    disabled={adding || draft.trim().length === 0}
                    className={SMALL_PRIMARY}
                  >
                    {adding ? 'Adding…' : 'Add to agenda'}
                  </button>
                  <button type="button" onClick={closeComposer} className={SMALL_TEXT_BUTTON}>
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : canAdd ? (
            <li className="flex">
              {/* The agenda grows from its end, so adding to it starts there,
                  on the same line as the questions it joins. */}
              <button
                ref={addButtonRef}
                type="button"
                onClick={() => setComposing(true)}
                className="group/add flex w-full items-center gap-2.5 rounded-2xl border border-transparent px-2.5 py-2 text-left text-[12.5px] font-medium text-rt-ink-muted transition-colors hover:bg-white hover:text-rt-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rt-secondary"
              >
                <span
                  aria-hidden
                  className="flex size-5 shrink-0 items-center justify-center text-rt-ink-faint group-hover/add:text-rt-secondary-deep"
                >
                  <Plus size={14} strokeWidth={2.25} />
                </span>
                Add question
              </button>
            </li>
          ) : null}
        </AgendaTimeline>
      )}

      {error && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2 text-[11px] text-red-600">
          {error}
        </p>
      )}

      {allDone && (
        <p className="-mx-3 shrink-0 border-t border-rt-tertiary px-3 py-2.5 text-[11.5px] text-rt-ink-muted">
          {isLeader
            ? 'Every question is done — end the session when you’re ready.'
            : 'Every question is done.'}
        </p>
      )}
    </BoardRail>
  );
}
