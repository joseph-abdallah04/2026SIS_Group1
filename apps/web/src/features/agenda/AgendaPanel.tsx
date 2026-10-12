import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lightbulb, Pencil, Plus } from 'lucide-react';
import {
  SHORTLIST_MIN,
  type Question,
  type QuestionStatus,
  type VotingPhase,
} from '@roundtable/shared';
import { SESSION_QUESTION_LIMIT, SESSION_QUESTION_TEXT_MAX } from '@roundtable/shared/schemas';

import { BoardRail } from '../../components/BoardRail';
import { PhaseTimer } from '../../components/PhaseTimer';
import { CARD_INK, REACTION_HOVER_FILL, REACTION_ON_BORDER } from '../pinboard/pinboardTokens';
import { useAddSessionQuestion } from '../sessions/useAddSessionQuestion';
import { useFocusQuestion } from '../sessions/useFocusQuestion';
import { useMoveQuestion } from '../sessions/useMoveQuestion';
import { useSetQuestionPhase, type QuestionPhaseTarget } from '../sessions/useSetQuestionPhase';
import { useSetQuestionText } from '../sessions/useSetQuestionText';
import { useSetQuestionVoting } from '../sessions/useSetQuestionVoting';
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
   * How many proposals the question in discussion has, so "Open voting" can
   * say how many more it needs. Omitted when the board is showing a different
   * question.
   */
  proposalCount?: number;
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
  'min-h-9 w-full rounded-full bg-rt-secondary px-3 py-1.5 text-[12.5px] font-semibold text-rt-ink shadow-sm transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-9 w-full rounded-full border border-rt-tertiary bg-white px-3 py-1.5 text-[12px] font-semibold text-rt-ink-muted transition-colors enabled:hover:border-rt-ink-faint enabled:hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const QUIET_LINK =
  'self-center rounded-sm px-1 text-[12px] font-medium text-rt-ink-muted hover:text-rt-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';
const SMALL_PRIMARY =
  'rounded-full bg-rt-secondary px-3 py-1 text-[11.5px] font-semibold text-rt-ink transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-50';
const SMALL_TEXT_BUTTON =
  'rounded-full px-2 py-1 text-[11.5px] font-medium text-rt-ink-muted hover:text-rt-ink hover:underline';
const EYEBROW = 'text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase';
/** A question being written or reworded: a box, so it is plain where to type. */
const TEXT_BOX =
  'min-w-0 rounded-lg border border-rt-tertiary bg-white px-2.5 py-1.5 text-[12.5px] leading-snug font-medium text-rt-ink outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-rt-ink-faint focus:border-rt-secondary focus:ring-2 focus:ring-rt-secondary/30 disabled:opacity-60';

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
 * F41: how a question finishes, as two choices side by side — a vote, or a
 * brainstorm that ends with the board as it is.
 */
function EndsWith({
  votingEnabled,
  onChange,
  disabled = false,
}: {
  votingEnabled: boolean;
  onChange: (votingEnabled: boolean) => void;
  disabled?: boolean;
}) {
  const option = (value: boolean, label: string) => {
    const on = votingEnabled === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        onClick={() => {
          if (!on) onChange(value);
        }}
        className={`rounded-full px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rt-secondary disabled:opacity-60 ${
          on ? 'bg-white text-rt-ink shadow-sm' : 'text-rt-ink-muted hover:text-rt-ink'
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span id="agenda-ends-with" className="text-[11.5px] whitespace-nowrap text-rt-ink-muted">
        Ends with
      </span>
      <div
        role="radiogroup"
        aria-labelledby="agenda-ends-with"
        className="inline-flex rounded-full bg-rt-ink/[0.06] p-0.5"
      >
        {option(true, 'A vote')}
        {option(false, 'Brainstorm')}
      </div>
    </div>
  );
}

/**
 * Opens a question to edit: its wording, and how it ends. A pencil, named for
 * screen readers and on hover; the same button on the card and on every
 * question still to come, so it opens the same editor wherever the leader is.
 */
function EditButton({
  number,
  onClick,
  className = '',
}: {
  number: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-no-drag
      onClick={onClick}
      aria-label={`Edit question ${number}`}
      title="Edit question"
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink-muted shadow-sm transition-colors hover:border-(--rt-control-edge) hover:bg-(--rt-control-fill) hover:text-(--rt-control-ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${className}`}
      style={
        {
          // The slate a proposal's ⋯ hovers to, so the leader's pencil reads as
          // the same kind of control wherever it sits.
          '--rt-control-fill': REACTION_HOVER_FILL,
          '--rt-control-edge': REACTION_ON_BORDER,
          '--rt-control-ink': CARD_INK,
        } as React.CSSProperties
      }
    >
      <Pencil aria-hidden="true" size={12} strokeWidth={2.25} />
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
 * nothing is — is a card, and what the leader does with it is on that card:
 * its one primary step, "Skip question" under it, and a button in its corner
 * that opens it to edit — its wording and how it ends — until voting opens. Each question still to come shows, under the
 * pointer, a handle to drag it to another place and an Edit button that opens
 * it in place: its wording and how it ends.
 *
 * The agenda grows from its end: "Add question" is its last row, and the + in
 * the header opens the same place from wherever the list is scrolled.
 * Participants see the same card and list with none of the controls.
 */
export function AgendaPanel({
  sessionId,
  questions,
  activeQuestionId,
  isLeader,
  votingPhase,
  hasProposals,
  proposalCount,
  timer,
}: AgendaPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  // The question being confirmed for skipping: only ever the card's.
  const [skippingId, setSkippingId] = useState<string | null>(null);
  // A question still to come, opened to edit in place.
  const [editing, setEditing] = useState<{
    id: string;
    draft: string;
    votingEnabled: boolean;
  } | null>(null);
  // Dragging a question to a new place: which one, how far it has travelled,
  // and which question's place it would take.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  // A press on a row that might become a drag, and whether the click that
  // follows a drag should be swallowed rather than open that question's board.
  const press = useRef<{ id: string; pointerId: number; startY: number } | null>(null);
  const swallowClick = useRef(false);
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
  const { move, place, busyQuestionId: moveBusyId, error: moveError } = useMoveQuestion(sessionId);
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

  /** Saves what changed in the editor: its wording, and how it ends. */
  async function onSaveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const current = questions.find((question) => question.id === editing.id);
    if (!current) {
      setEditing(null);
      return;
    }
    const text = editing.draft.trim();
    if (text && text !== current.text && !(await setText(editing.id, text))) return;
    if (
      editing.votingEnabled !== current.votingEnabled &&
      !(await setVoting(editing.id, editing.votingEnabled))
    ) {
      return;
    }
    setEditing(null);
  }

  async function onSkip(question: Question) {
    if (await setPhase(question.id, 'skipped')) setSkippingId(null);
  }

  function startEditing(question: Question) {
    setEditing({ id: question.id, draft: question.text, votingEnabled: question.votingEnabled });
  }

  function editor(question: Question, index: number) {
    if (editing?.id !== question.id) return undefined;
    const busy =
      textBusyId === question.id || votingBusyId === question.id || phaseBusyId === question.id;
    return (
      <form
        onSubmit={(event) => void onSaveEdit(event)}
        // The editor opens without taking the cursor, so Escape puts it away
        // from anywhere inside it, not only from the text box.
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setEditing(null);
          }
        }}
        className="flex flex-col gap-2.5"
      >
        <label className="sr-only" htmlFor={`agenda-edit-${question.id}`}>
          Question {index + 1}
        </label>
        <textarea
          id={`agenda-edit-${question.id}`}
          value={editing.draft}
          rows={1}
          onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setEditing(null);
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={SESSION_QUESTION_TEXT_MAX}
          disabled={busy}
          className={`field-sizing-content w-full resize-none ${TEXT_BOX}`}
        />
        <EndsWith
          votingEnabled={editing.votingEnabled}
          onChange={(votingEnabled) => setEditing({ ...editing, votingEnabled })}
          disabled={busy}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setEditing(null)} className={SMALL_TEXT_BUTTON}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || editing.draft.trim().length === 0}
              className={SMALL_PRIMARY}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
      </form>
    );
  }

  /** The leader's controls on the card: its one primary step, then Skip. */
  function cardControls(question: Question) {
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
        ) : null}
        {canSkip ? (
          <button type="button" onClick={() => setSkippingId(question.id)} className={QUIET_LINK}>
            Skip question
          </button>
        ) : null}
      </div>
    );
  }

  /**
   * A question still to come is dragged by the whole row to another place
   * among the questions still to come, so there is no small target to find.
   *
   * Pointer events rather than the browser's drag and drop: that draws its own
   * cursor over the page and a ghost image of the row, and neither can be
   * changed. Here the row itself lifts and follows the pointer up and down,
   * and the cursor stays the pointer the row already shows.
   *
   * A press that does not travel is still a click: on the text, it puts that
   * question's board up. The keyboard moves it from its text (`reorderKeys`).
   */
  function dragWiring(question: Question, index: number) {
    if (!isLeader || question.status !== 'pending') return {};
    // Any question still to come can take a dragged one's place, the card's
    // included; only rows that are not the card or being edited pick up.
    const droppable = { 'data-question-id': question.id } as React.LiHTMLAttributes<HTMLLIElement>;
    const isCardRow = question.id === controlled?.id;
    const from = dragId ? questions.findIndex((row) => row.id === dragId) : -1;
    const isTarget = dragId !== null && overId === question.id && dragId !== question.id;
    const dropIndicator = isTarget
      ? from > index
        ? ('before' as const)
        : ('after' as const)
      : null;
    if (isCardRow || editing?.id === question.id) return { dropIndicator, liProps: droppable };

    const reset = () => {
      press.current = null;
      setDragId(null);
      setOverId(null);
      setDragOffset(0);
    };
    return {
      dropIndicator,
      movable: true,
      dragging: dragId === question.id,
      dragOffset: dragId === question.id ? dragOffset : 0,
      liProps: {
        ...droppable,
        onPointerDown: (event: React.PointerEvent<HTMLLIElement>) => {
          if (event.button !== 0) return;
          // Its own controls are their own presses.
          if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
          press.current = { id: question.id, pointerId: event.pointerId, startY: event.clientY };
        },
        onPointerMove: (event: React.PointerEvent<HTMLLIElement>) => {
          const started = press.current;
          if (!started || started.pointerId !== event.pointerId) return;
          const travelled = event.clientY - started.startY;
          if (dragId !== question.id) {
            // A few pixels of wobble is still a click.
            if (Math.abs(travelled) < 4) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragId(question.id);
          }
          setDragOffset(travelled);
          // Which other question's row the pointer is over, from where those
          // rows sit. Not `elementFromPoint`: the dragged row travels under the
          // pointer, so that would only ever find the row being dragged.
          const list = event.currentTarget.parentElement;
          const rows = list ? [...list.querySelectorAll<HTMLElement>('[data-question-id]')] : [];
          const target = rows.find((row) => {
            if (row.dataset.questionId === question.id) return false;
            const box = row.getBoundingClientRect();
            return event.clientY >= box.top && event.clientY <= box.bottom;
          });
          setOverId(target?.dataset.questionId ?? null);
        },
        onPointerUp: () => {
          const moving = dragId === question.id;
          const target = overId;
          reset();
          if (!moving) return;
          swallowClick.current = true;
          if (target) void place(question.id, target);
        },
        onPointerCancel: reset,
        // The press that ended a drag is not also a click on the text.
        onClickCapture: (event: React.MouseEvent<HTMLLIElement>) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        },
      },
    };
  }

  /**
   * The keyboard's way to move a question still to come, from its text:
   * Alt+Up and Alt+Down, past other questions that have not started.
   */
  function reorderKeys(question: Question, index: number) {
    const canUp = questions[index - 1]?.status === 'pending';
    const canDown = questions[index + 1]?.status === 'pending';
    if (!canUp && !canDown) return undefined;
    return (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey) return;
      if (event.key === 'ArrowUp' && canUp) {
        event.preventDefault();
        void move(question.id, 'up');
      } else if (event.key === 'ArrowDown' && canDown) {
        event.preventDefault();
        void move(question.id, 'down');
      }
    };
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
            const isEditing = editing?.id === question.id;
            // The board is showing this one rather than the question the room
            // is on: said out loud, so nobody mistakes the old board for the
            // live one.
            const lookingBack = isFocused && !isCard;
            // Only before it starts: once under way its status already says
            // "Brainstorming", and a second chip would repeat it.
            const brainstorm = !question.votingEnabled && isPending ? <BrainstormChip /> : null;
            const status = statusChip(question, votingPhase);
            const busy = moveBusyId === question.id || textBusyId === question.id;

            // Edit opens the question in place: its wording and how it ends.
            // On the card, beside its status, until voting opens and both are
            // fixed; on a row still to come, in its corner under the pointer.
            const cardEdit =
              isCard && isLeader && canChangeVote(question.status) ? (
                <EditButton
                  number={index + 1}
                  onClick={() => startEditing(question)}
                  className="ml-auto"
                />
              ) : null;
            const rowEdit =
              !isCard && isLeader && isPending ? (
                <EditButton
                  number={index + 1}
                  onClick={() => startEditing(question)}
                  className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover/step:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                />
              ) : undefined;

            // The card says where the room is: its status and clock on top,
            // the question, then what the leader can do with it.
            const cardPrefix = isCard ? (
              <div className="mb-1.5 flex min-h-6 items-center gap-2">
                {status ? (
                  <AgendaChip tone={status.tone}>{status.label}</AgendaChip>
                ) : (
                  <AgendaChip tone="neutral">Up next</AgendaChip>
                )}
                {brainstorm}
                {timer && timer.questionId === question.id && question.status !== 'pending' ? (
                  <PhaseTimer
                    compact
                    startedAt={timer.startedAt}
                    durationSeconds={timer.durationSeconds}
                    allowOvertime
                    label="Discussion"
                  />
                ) : null}
                {cardEdit}
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
                prefix={isEditing ? undefined : cardPrefix}
                // The leader can put any question's board up to look at —
                // finished, or still to come — without changing where the room
                // is. The row says "Viewing" while it is up.
                onSelect={
                  isLeader && !isEditing
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
                note={
                  question.status === 'skipped' ? (question.skipReason ?? undefined) : undefined
                }
                action={busy ? undefined : rowEdit}
                hoverable={!isCard && isLeader && isPending}
                onTextKeyDown={
                  !isCard && isLeader && isPending ? reorderKeys(question, index) : undefined
                }
                {...dragWiring(question, index)}
                textSlot={editor(question, index)}
              >
                {isCard && isLeader && !isEditing ? (
                  skippingId === question.id ? (
                    <div className="mt-3">
                      <SkipConfirm
                        questionNumber={index + 1}
                        busy={phaseBusyId === question.id}
                        onSkip={() => void onSkip(question)}
                        onCancel={() => setSkippingId(null)}
                      />
                    </div>
                  ) : (
                    cardControls(question)
                  )
                ) : null}
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
                    className={`flex-1 ${TEXT_BOX}`}
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
            ? 'Every question is done. End the session when you’re ready.'
            : 'Every question is done.'}
        </p>
      )}
    </BoardRail>
  );
}
