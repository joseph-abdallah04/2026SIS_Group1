import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Lightbulb, Pencil, Plus, SkipForward } from 'lucide-react';
import {
  SHORTLIST_MIN,
  type Question,
  type QuestionStatus,
  type VotingPhase,
} from '@roundtable/shared';
import { SESSION_QUESTION_LIMIT, SESSION_QUESTION_TEXT_MAX } from '@roundtable/shared/schemas';

import { BoardRail } from '../../components/BoardRail';
import { PhaseTimer } from '../../components/PhaseTimer';
import {
  boxAt,
  droppedOrder,
  followPointer,
  landingIndex,
  landingOffset,
  measureRows,
  REORDER_EASING,
  rubberBand,
  slideShifts,
  type RowLayout,
} from '../../lib/dragReorder';
import { CARD_INK, REACTION_HOVER_FILL, REACTION_ON_BORDER } from '../pinboard/pinboardTokens';
import { useAddSessionQuestion } from '../sessions/useAddSessionQuestion';
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
  CARD_FOCUS_RING,
  CARD_EDGE,
  CARD_SHAPE,
  revealInList,
  StepNode,
  ShowingChip,
  ViewingChip,
  type AgendaChipTone,
  REORDER_MS,
} from './AgendaTimeline';
import { SkipConfirm } from './SkipConfirm';

interface AgendaPanelProps {
  sessionId: string;
  questions: Question[];
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
  /**
   * The question this person is looking at instead of the room's, if any. Each
   * person's own: looking back or ahead moves nobody else's board.
   */
  viewingQuestionId?: string | null;
  /** Look at another question's board, or `null` to go back to the room's. */
  onView?: (questionId: string | null) => void;
  /**
   * The question the leader has put up for everyone, when it is not the one
   * in play: marked on its row for the whole room, so nobody loses track of
   * where everyone is while they look around.
   */
  showingQuestionId?: string | null;
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
  'min-h-10 w-full rounded-full bg-rt-secondary px-3 py-1.5 text-[12.5px] font-semibold text-rt-ink shadow-sm transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-9 w-full rounded-full border border-rt-tertiary bg-white px-3 py-1.5 text-[12px] font-semibold text-rt-ink-muted transition-colors enabled:hover:border-rt-ink-faint enabled:hover:text-rt-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60';
const QUIET_LINK =
  'self-center rounded-sm px-1 text-[12.5px] font-medium text-[#667085] hover:text-rt-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary';
const EYEBROW = 'text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase';
/**
 * The footer buttons of the forms that add a question or edit one: small and
 * right-aligned, well below the live card's full-width action.
 */
const EDIT_PRIMARY =
  'inline-flex h-7 items-center rounded-full bg-[#DFA243] px-3.5 text-[12.5px] font-semibold text-[#1F2328] transition-colors enabled:hover:bg-rt-secondary-deep enabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DFA243] disabled:opacity-45';
const EDIT_TEXT_BUTTON =
  'inline-flex h-7 items-center rounded-full px-2.5 text-[12.5px] font-semibold text-[#475467] transition-colors hover:bg-[#EFEDE8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DFA243]';
/**
 * A question being written or reworded: a box, so it is plain where to type.
 * In the card's title type, so the words break where they do on the card, and
 * the box's padding and edge (18px) are what the forms trade for the card's
 * own spacing round its title: the shapes stay one height.
 */
const EDIT_BOX =
  'min-w-0 rounded-xl border-[1.5px] border-[#D9D4CB] bg-white px-2.5 py-[7.5px] text-[14.5px] leading-snug font-semibold text-rt-ink outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-rt-ink-faint focus:border-rt-secondary focus:ring-2 focus:ring-rt-secondary/30 disabled:opacity-60';

/**
 * How close a question is to the longest it may be, once it is close: quiet
 * until the last fifth, then counting, and red past the end (a question
 * written before the limit was tightened can be longer than it now allows).
 * In the forms' button row, so it adds nothing to their height.
 */
function LengthCount({ length }: { length: number }) {
  if (length < SESSION_QUESTION_TEXT_MAX * 0.8) return null;
  const over = length > SESSION_QUESTION_TEXT_MAX;
  return (
    <span
      aria-live="polite"
      className={`mr-auto text-[11px] font-medium tabular-nums ${
        over ? 'text-[#B42318]' : 'text-rt-ink-faint'
      }`}
    >
      {length}/{SESSION_QUESTION_TEXT_MAX}
      <span className="sr-only">{over ? ' characters, too long' : ' characters'}</span>
    </span>
  );
}

/**
 * F41: how a question finishes, as two choices side by side — a vote, or a
 * brainstorm that ends with the board as it is. The same control when adding a
 * question and when editing one, so the choice looks the same both times.
 */
function EndsWith({
  votingEnabled,
  onChange,
  disabled = false,
  stretch = false,
}: {
  votingEnabled: boolean;
  onChange: (votingEnabled: boolean) => void;
  disabled?: boolean;
  /** Fill the row: the editor's choice runs to the edge of the text box above it. */
  stretch?: boolean;
}) {
  // Both forms can be open at once, so the label's id cannot be a fixed one.
  const labelId = useId();
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
        className={`rounded-full font-semibold whitespace-nowrap transition-colors ${stretch ? 'flex-1 px-2.5 py-0.5' : 'px-3 py-1'} text-[11.5px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rt-secondary disabled:opacity-60 ${
          on ? 'bg-white text-rt-ink shadow-sm' : 'text-rt-ink-muted hover:text-rt-ink'
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className={`flex flex-wrap items-center gap-y-1.5 ${stretch ? 'gap-x-2' : 'gap-x-2.5'}`}>
      <span id={labelId} className="text-[11.5px] whitespace-nowrap text-rt-ink-muted">
        Ends with
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        // Filling the row, but never narrower than its two words: on a narrow
        // panel it drops under "Ends with" and fills that line instead.
        className={`inline-flex rounded-full bg-rt-ink/[0.06] p-0.5 ${stretch ? 'flex-1' : ''}`}
      >
        {option(true, 'A vote')}
        {option(false, 'Brainstorm')}
      </div>
    </div>
  );
}

/** `questions`, with the ones in `held` back in that order, in the places they fill. */
function holdOrder(questions: Question[], held: string[]) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const queue = held.flatMap((id) => byId.get(id) ?? []);
  if (queue.length !== held.length) return questions;
  return questions.map((question) =>
    held.includes(question.id) ? (queue.shift() ?? question) : question,
  );
}

/**
 * How tall the card for the question in play is right now, if there is one.
 * The add form opens at that height: its box starts empty, a line tall, and
 * the card's question may run to more.
 */
function liveCardHeight() {
  return document.querySelector<HTMLElement>('[data-agenda-card]')?.getBoundingClientRect().height;
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
  isLeader,
  votingPhase,
  hasProposals,
  proposalCount,
  timer,
  viewingQuestionId = null,
  showingQuestionId = null,
  onView,
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
  // A question being dragged to a new place: how far it has travelled, and how
  // far each row it has passed has slid to make room for it. `settling` once
  // it is let go, while it eases into its new place and the new order is on
  // its way from the server; `expected` is that order.
  const [drag, setDrag] = useState<{
    id: string;
    offset: number;
    shifts: Record<string, number>;
    settling: boolean;
    expected?: string;
    /** The order the rows were in when it lifted, held until `expected` arrives. */
    held?: string[];
  } | null>(null);
  // A press on a row that might become a drag, and whether the click that
  // follows a drag should be swallowed rather than open that question's board.
  const press = useRef<{
    id: string;
    pointerId: number;
    /** The row pressed: what lifts, and whose list it moves in. */
    row: HTMLLIElement;
    /** Where the rows sat when it became a drag. */
    layout?: RowLayout;
    /** The row whose place it would take, as an index into the layout. */
    target?: number;
    /** How far each row it has passed has slid, as last drawn. */
    shifts?: Record<string, number>;
  } | null>(null);
  const swallowClick = useRef(false);
  // The move is sent once the dropped row has eased into its gap.
  const placeTimer = useRef<number | undefined>(undefined);
  // Stops following a press's pointer (`followPointer`), if one is held.
  const stopFollowing = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(placeTimer.current);
      stopFollowing.current?.();
    },
    [],
  );
  // The new order arrives with every row already where it puts them, so the
  // slides come off in the very render that brings it: a frame later, and the
  // new order would flash with the old offsets still on it. Until it comes
  // the rows hold their places; a drop that moves nothing, or a move that
  // fails, eases back first.
  const pendingOrder = questions
    .filter((question) => question.status === 'pending')
    .map((question) => question.id)
    .join();
  const shownDrag = drag?.settling && drag.expected === pendingOrder ? null : drag;
  // A move past several questions arrives as several updates, one question at
  // a time. The list keeps the order it was dragged in until the last of them
  // lands, rather than passing through the steps in between under rows that
  // are still slid aside for the old one.
  const listed = shownDrag?.held ? holdOrder(questions, shownDrag.held) : questions;
  // Where each row sat, settled, when a dropped question's move was sent, from
  // the top of the list. The new order can still change a row's height: the
  // "Up next" label moves to whichever question is now first. So when it
  // lands, every row glides from where it was shown to where it now is,
  // rather than jumping the difference.
  const landed = useRef<{ list: HTMLElement; tops: Record<string, number> } | null>(null);
  const wasDragging = useRef(false);
  useLayoutEffect(() => {
    const ended = wasDragging.current && !shownDrag;
    wasDragging.current = Boolean(shownDrag);
    const from = landed.current;
    if (!ended || !from) return;
    landed.current = null;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const listTop = from.list.getBoundingClientRect().top;
    for (const row of from.list.querySelectorAll<HTMLElement>('[data-question-id]')) {
      const was = from.tops[row.dataset.questionId ?? ''];
      if (was === undefined || typeof row.animate !== 'function') continue;
      const delta = was - (row.getBoundingClientRect().top - listTop);
      if (Math.abs(delta) < 0.5) continue;
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
        duration: REORDER_MS,
        easing: REORDER_EASING,
      });
    }
  }, [shownDrag]);
  useEffect(() => {
    if (!drag?.settling) return;
    if (drag.expected !== undefined && drag.expected === pendingOrder) {
      setDrag(null);
      return;
    }
    // A broadcast that never comes should not leave the rows slid aside.
    const timer = window.setTimeout(
      () => setDrag(null),
      drag.expected === undefined ? REORDER_MS : 4000,
    );
    return () => window.clearTimeout(timer);
  }, [drag, pendingOrder]);
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
  const { addQuestion, busy: adding, error: addError } = useAddSessionQuestion(sessionId);
  const [composing, setComposing] = useState(false);
  // The card in play's height as the form opened, so it is the same shape.
  const [composerMinHeight, setComposerMinHeight] = useState<number | undefined>(undefined);
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
    if (added.length > 0) setFreshIds(added);
  }, [questions]);
  // The tint fades on a clock of its own. Kept with the arrival above, it was
  // cancelled by the next change to the agenda (a new question is usually
  // followed straight away by another update) and never set again, so the
  // tint stayed.
  useEffect(() => {
    if (freshIds.length === 0) return;
    const fade = window.setTimeout(() => setFreshIds([]), FRESH_MS);
    return () => window.clearTimeout(fade);
  }, [freshIds]);

  const summary = summarizeAgenda(questions);
  const allDone = summary.total > 0 && summary.done === summary.total;
  const openIndex = questions.findIndex(
    (question) => question.status === 'discussion' || question.status === 'voting',
  );
  const openQuestion = openIndex === -1 ? undefined : questions[openIndex];
  const firstPending = questions.find((question) => question.status === 'pending');
  const error = phaseError ?? votingError ?? textError ?? moveError ?? addError;
  const canAdd = isLeader && questions.length < SESSION_QUESTION_LIMIT;

  // The card is the question the room is on: the one actually open, even
  // while the board looks back at an earlier one, or the next to start.
  const controlled = openQuestion ?? firstPending;
  // The question that follows it, marked so the room can see what is coming.
  const upNext = openQuestion ? firstPending : undefined;
  // The label opens out only when it moves to another question, once. Not
  // whenever it is drawn: the list is drawn afresh each time the agenda is
  // collapsed and opened again, and the label would grow in every time.
  const [upNextArrivingId, setUpNextArrivingId] = useState<string | null>(null);
  const lastUpNextId = useRef(upNext?.id);
  useLayoutEffect(() => {
    if (lastUpNextId.current === upNext?.id) return;
    lastUpNextId.current = upNext?.id;
    setUpNextArrivingId(upNext?.id ?? null);
  }, [upNext?.id]);
  const next = controlled ? nextPhase(controlled) : undefined;
  // Not while the ballot is up: from the moment the vote starts until its
  // result is put away, the ballot lies over the whole agenda, so a Skip on
  // the card could be seen but never pressed.
  const ballotUp = votingPhase === 'open' || votingPhase === 'closed';
  const canSkip = controlled !== undefined && !(controlled.status === 'voting' && ballotUp);
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
    setEditing({
      id: question.id,
      draft: question.text,
      votingEnabled: question.votingEnabled,
    });
  }

  function openComposer() {
    setComposerMinHeight(liveCardHeight());
    setComposing(true);
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
        className="flex flex-1 flex-col gap-2"
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
          className={`field-sizing-content w-full resize-none ${EDIT_BOX}`}
        />
        <EndsWith
          votingEnabled={editing.votingEnabled}
          onChange={(votingEnabled) => setEditing({ ...editing, votingEnabled })}
          disabled={busy}
          stretch
        />
        <div className="mt-auto flex items-center justify-end gap-1.5">
          <LengthCount length={editing.draft.trim().length} />
          <button type="button" onClick={() => setEditing(null)} className={EDIT_TEXT_BUTTON}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              editing.draft.trim().length === 0 ||
              editing.draft.trim().length > SESSION_QUESTION_TEXT_MAX
            }
            className={EDIT_PRIMARY}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
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
      <div className="mt-3.5 flex flex-col gap-2">
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
   * The row lifts and follows the pointer up and down, no further than the
   * first and last of those questions, and the rows it passes slide out of its
   * way: the gap is always where it would land, so the new order shows before
   * it is let go. Let go, it eases into the gap.
   *
   * Pointer events rather than the browser's drag and drop: that draws its own
   * cursor over the page and a ghost image of the row, and neither can be
   * changed. Here the cursor stays the pointer the row already shows.
   *
   * A press that does not travel is still a click: on the text, it puts that
   * question's board up. The keyboard moves it from its text (`reorderKeys`).
   *
   * Once pressed, the pointer is followed on the window (`followPointer`), not
   * on the row: the rail's list can scroll the row out from under it, and a
   * let-go anywhere must still end the drag. The window's listeners call these
   * through `dragHandlers`, so they always act on the render that is current.
   */
  function onDragMove(travelled: number) {
    const started = press.current;
    if (!started) return;
    if (!started.layout) {
      // A few pixels of wobble is still a click.
      if (Math.abs(travelled) < 4) return;
      // Captured only now it is a drag, so a click still lands on the text.
      try {
        started.row.setPointerCapture(started.pointerId);
      } catch {
        // The window hears it regardless.
      }
      started.layout = measureRows(started.row, started.id, 'data-question-id');
    }
    const { min, max } = started.layout;
    const offset = Math.min(max, Math.max(min, travelled));
    const target = landingIndex(started.layout, offset);
    started.target = target;
    // Every row between its place and the one it would take slides one place
    // towards where it came from.
    const shifts = slideShifts(started.layout, target);
    started.shifts = shifts;
    // Past the first or last, the row gives a little and no more, so the end
    // is felt rather than hit; let go, it springs back.
    const give = rubberBand(travelled - offset);
    setDrag({ id: started.id, offset: offset + give, shifts, settling: false });
  }

  function onDragUp() {
    const started = press.current;
    press.current = null;
    const layout = started?.layout;
    if (!started || !layout || started.target === undefined) return;
    swallowClick.current = true;
    const { id } = started;
    const { ids, self } = layout;
    const target = started.target;
    const onto = ids[target];
    if (target === self || !onto) {
      // Back where it started: ease home.
      setDrag({ id, offset: 0, shifts: {}, settling: true });
      return;
    }
    const expected = droppedOrder(layout, target);
    const list = started.row.parentElement;
    if (list) {
      const listTop = list.getBoundingClientRect().top;
      const shifts = started.shifts ?? {};
      landed.current = {
        list,
        tops: Object.fromEntries(
          ids.map((rowId, i) => [
            rowId,
            boxAt(layout.boxes, i).top -
              listTop +
              (i === self ? landingOffset(layout, target) : (shifts[rowId] ?? 0)),
          ]),
        ),
      };
    }
    setDrag((current) => ({
      id,
      shifts: current?.shifts ?? {},
      // Into the gap the other rows have opened.
      offset: landingOffset(layout, target),
      settling: true,
      expected: expected.join(),
      held: ids,
    }));
    // Sent once the row is at rest in the gap, so the new order lands on rows
    // that have stopped moving rather than on one mid-slide.
    placeTimer.current = window.setTimeout(() => {
      void place(id, onto).then((ok) => {
        if (!ok) {
          landed.current = null;
          setDrag(
            (current) => current && { ...current, offset: 0, shifts: {}, expected: undefined },
          );
        }
      });
    }, REORDER_MS);
  }

  function onDragCancel() {
    press.current = null;
    setDrag(null);
  }

  const dragHandlers = useRef({ move: onDragMove, up: onDragUp, cancel: onDragCancel });
  dragHandlers.current = { move: onDragMove, up: onDragUp, cancel: onDragCancel };

  function dragWiring(question: Question) {
    if (!isLeader || question.status !== 'pending') return {};
    // Any question still to come can make way for a dragged one, the card's
    // included; only rows that are not the card or being edited pick up.
    const droppable = { 'data-question-id': question.id } as React.LiHTMLAttributes<HTMLLIElement>;
    const lifted = shownDrag?.id === question.id;
    const motion = shownDrag
      ? {
          shift: lifted ? shownDrag.offset : (shownDrag.shifts[question.id] ?? 0),
          // The lifted row is the pointer's until it is let go.
          glide: !lifted || shownDrag.settling,
        }
      : {};
    if (question.id === controlled?.id || editing?.id === question.id) {
      return { ...motion, liProps: droppable };
    }

    return {
      ...motion,
      movable: true,
      dragging: lifted,
      liProps: {
        ...droppable,
        onPointerDown: (event: React.PointerEvent<HTMLLIElement>) => {
          if (event.button !== 0 || drag) return;
          // Its own controls are their own presses.
          if ((event.target as HTMLElement).closest('[data-no-drag]')) return;
          // Text left selected anywhere on the page, the card's say, would
          // otherwise be what moves: the browser drags the selection instead
          // and cancels this press, so the row never lifts.
          window.getSelection()?.removeAllRanges();
          const row = event.currentTarget;
          press.current = { id: question.id, pointerId: event.pointerId, row };
          stopFollowing.current?.();
          stopFollowing.current = followPointer(
            { pointerId: event.pointerId, startY: event.clientY, list: row.parentElement },
            {
              move: (travelled) => dragHandlers.current.move(travelled),
              up: () => {
                stopFollowing.current = null;
                dragHandlers.current.up();
              },
              cancel: () => {
                stopFollowing.current = null;
                dragHandlers.current.cancel();
              },
            },
          );
        },
        onDragStart: (event: React.DragEvent<HTMLLIElement>) => event.preventDefault(),
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
      const direction =
        event.key === 'ArrowUp' && canUp
          ? 'up'
          : event.key === 'ArrowDown' && canDown
            ? 'down'
            : null;
      if (!direction) return;
      event.preventDefault();
      // One move at a time: a held key repeats faster than the server answers,
      // and a second move sent before the first lands is refused as the
      // agenda having changed under it.
      if (moveBusyId !== null) return;
      void move(question.id, direction);
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
            onClick={openComposer}
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
          {listed.map((question, index) => {
            const isCard = question.id === controlled?.id;
            const isPending = question.status === 'pending';
            const isEditing = editing?.id === question.id;
            // The board is showing this one rather than the question the room
            // is on: said out loud, so nobody mistakes the old board for the
            // live one.
            const lookingBack = question.id === viewingQuestionId && !isCard;
            const showing = question.id === showingQuestionId && !isCard;
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
                  // Under the pointer, as on the rows below: the card's job is
                  // its next step, and the pencil stays out of the way until
                  // the leader reaches for it.
                  className="ml-auto opacity-0 transition-opacity group-hover/step:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
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

            // Asking whether to skip it: the card itself turns into the
            // question, rather than a second box opening under it.
            const confirmingSkip = isCard && skippingId === question.id;

            // The card says where the room is: its status and clock on top,
            // the question, then what the leader can do with it.
            const cardPrefix = confirmingSkip ? (
              <div className="mb-3 flex min-h-6 items-center gap-2">
                <span className="-ml-[8.5px] flex">
                  <AgendaChip
                    tone="confirm"
                    size="md"
                    icon={
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-rt-tertiary bg-white text-rt-ink">
                        <SkipForward aria-hidden size={10} strokeWidth={2.5} />
                      </span>
                    }
                  >
                    Skip this question?
                  </AgendaChip>
                </span>
              </div>
            ) : isCard ? (
              <div className="mb-3 flex min-h-6 items-center gap-2">
                {/* The card's mark sits in its status pill, pulled out into
                    the column the rows' marks run down: the card's 16px
                    padding and 1.5px edge less a row's 10px and 1px, plus the
                    pill's own 2px before its mark. */}
                <span className="-ml-[8.5px] flex">
                  <AgendaChip
                    tone={status ? status.tone : 'neutral'}
                    size="md"
                    icon={<StepNode state={stepState(question.status)} number={index + 1} />}
                  >
                    {status ? status.label : 'Up next'}
                  </AgendaChip>
                </span>
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
              <span
                className={`${EYEBROW} mb-0.5 ${upNextArrivingId === question.id ? 'rt-eyebrow-in' : ''}`}
                onAnimationEnd={() => setUpNextArrivingId(null)}
              >
                Up next
              </span>
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
                confirming={confirmingSkip}
                // Anyone can look at any question's board — finished, or still
                // to come — on their own screen, without moving the room's. The
                // row says "Viewing" while it is up; pressing it again goes back
                // to the room's. The card asks for its own question, which is
                // the room's unless the leader has put another up.
                onSelect={
                  onView && !isEditing ? () => onView(lookingBack ? null : question.id) : undefined
                }
                // On the card the status is on top; elsewhere it is under the
                // text, and a finished row leaves it to its node.
                status={isCard ? null : status}
                extraChips={
                  !isCard && (lookingBack || showing || brainstorm) ? (
                    <>
                      {showing ? <ShowingChip /> : null}
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
                {...dragWiring(question)}
                textSlot={editor(question, index)}
              >
                {isCard && isLeader && !isEditing ? (
                  confirmingSkip ? (
                    <div className="mt-2">
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
            // The same shape as a question being edited: a header saying what
            // is going on, then the box and its choices across the whole width.
            <li
              ref={composerRef}
              className={`flex flex-col rounded-2xl ${CARD_SHAPE} ${CARD_EDGE} ${CARD_FOCUS_RING}`}
              style={{ minHeight: composerMinHeight }}
            >
              <form onSubmit={(event) => void onAdd(event)} className="flex flex-1 flex-col gap-2">
                <div className="flex min-h-6 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-rt-secondary text-[10px] font-semibold text-rt-secondary-deep tabular-nums"
                  >
                    {questions.length + 1}
                  </span>
                  <label
                    htmlFor="agenda-new-question"
                    className="text-[12.5px] font-medium text-rt-ink-muted"
                  >
                    New question
                  </label>
                </div>
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
                  className={`w-full ${EDIT_BOX}`}
                />
                <EndsWith
                  votingEnabled={draftVoting}
                  onChange={setDraftVoting}
                  disabled={adding}
                  stretch
                />
                <div className="mt-auto flex items-center justify-end gap-1.5">
                  <LengthCount length={draft.trim().length} />
                  <button type="button" onClick={closeComposer} className={EDIT_TEXT_BUTTON}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      adding ||
                      draft.trim().length === 0 ||
                      draft.trim().length > SESSION_QUESTION_TEXT_MAX
                    }
                    className={EDIT_PRIMARY}
                  >
                    {adding ? 'Adding…' : 'Add'}
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
                onClick={openComposer}
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
