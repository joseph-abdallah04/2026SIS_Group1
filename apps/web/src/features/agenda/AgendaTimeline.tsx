import { Check, Eye, SkipForward } from 'lucide-react';
import { useEffect, useRef, type LiHTMLAttributes, type ReactNode } from 'react';

import type { AgendaStepState } from './agendaSummary';

/**
 * `live` is the question in play, in the app's live colour. `done` is a
 * finished one, in the accent its node is filled with. `neutral` is passed
 * over or never reached, and `outline` is a note beside the status rather
 * than a status.
 */
export type AgendaChipTone = 'live' | 'done' | 'neutral' | 'outline';

const CHIP_TONE: Record<AgendaChipTone, string> = {
  live: 'bg-rt-cool-tint text-rt-cool-deep',
  done: 'bg-rt-secondary-wash text-rt-secondary-deep',
  neutral: 'bg-rt-surface-sunken text-rt-ink-faint',
  outline: 'border border-rt-tertiary bg-white text-rt-ink-muted',
};

/** A question's status, as a small pill under its text. */
export function AgendaChip({
  tone,
  icon,
  children,
}: {
  tone: AgendaChipTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] leading-tight font-semibold ${CHIP_TONE[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Where the board is looking, when that is not the question in play. */
export function ViewingChip() {
  return (
    <AgendaChip tone="outline" icon={<Eye aria-hidden size={11} strokeWidth={2.25} />}>
      Viewing
    </AgendaChip>
  );
}

const NODE_CLASS: Record<AgendaStepState, string> = {
  answered: 'border-rt-secondary bg-rt-secondary text-white',
  skipped: 'border-rt-tertiary bg-rt-surface-sunken text-rt-ink-faint',
  live: 'border-2 border-rt-cool bg-white',
  pending: 'border-rt-tertiary bg-white text-rt-ink-muted',
};

/**
 * The circle beside a question, which says what happened to it: a tick once
 * answered, a skip mark once skipped, a dot while it is in play, and
 * its number while it is still to come.
 */
function StepNode({
  state,
  number,
  editing = false,
}: {
  state: AgendaStepState;
  number: number;
  /** Being reworded: a dashed accent ring around its number. */
  editing?: boolean;
}) {
  if (editing) {
    return (
      <span
        aria-hidden
        className="relative z-1 flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-rt-secondary bg-white text-[10px] font-semibold text-rt-secondary-deep tabular-nums"
      >
        {number}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`relative z-1 flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums ${NODE_CLASS[state]}`}
    >
      {state === 'answered' ? (
        <Check size={11} strokeWidth={3.25} />
      ) : state === 'skipped' ? (
        <SkipForward size={9} strokeWidth={2.5} />
      ) : state === 'live' ? (
        <span className="size-2 rounded-full bg-rt-cool" />
      ) : (
        number
      )}
    </span>
  );
}

/**
 * Scroll the list a step sits in just far enough to show it, and nothing else.
 *
 * Not `scrollIntoView`: that scrolls every ancestor that can scroll, and an
 * `overflow: hidden` box still can from script. The board's row and the page
 * are such boxes, so a step out of view could slide the whole session layout
 * sideways or up. Only the list moves here, by exactly the overflow, and not
 * at all when the step is already in view. No smoothing, so nothing glides on
 * its own.
 */
export function revealInList(step: HTMLElement): void {
  const list = step.parentElement;
  if (!list) return;
  const view = list.getBoundingClientRect();
  const box = step.getBoundingClientRect();
  if (box.top < view.top) list.scrollTop -= view.top - box.top;
  // Below: bring its foot into view, but never push its head out of the top
  // when it is taller than the list.
  else if (box.bottom > view.bottom)
    list.scrollTop += Math.min(box.bottom - view.bottom, box.top - view.top);
}

interface AgendaStepProps {
  /** One-based, for the pending node. */
  number: number;
  text: string;
  state: AgendaStepState;
  /**
   * The question the room is on: lifted into the white card, with its whole
   * text larger and whatever rides on it. In the live agenda that is the
   * question in play; in an ended session, the one being looked at.
   */
  focused: boolean;
  /**
   * In play but not on screen, while the board looks back at another question:
   * tinted so the controls riding on it are still easy to find.
   */
  highlighted?: boolean;
  /** Just added to the agenda: tinted for a moment so the room notices it. */
  fresh?: boolean;
  /**
   * Above the text: the card's status and timer, or "Up next" over the
   * question that follows the one in play.
   */
  prefix?: ReactNode;
  /**
   * Keys on the question text: how the keyboard moves a row that can be
   * dragged, since a drag is the pointer's.
   */
  onTextKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  /** Present: the question text is a button that puts this question up. */
  onSelect?: () => void;
  /**
   * What happened to it, as a chip under the text. Shown on the card and on
   * anything still to come; a finished question in the list leaves it to its
   * node and keeps it for screen readers only.
   */
  status?: { label: string; tone: AgendaChipTone } | null;
  /** More chips beside the status, shown whenever given. */
  extraChips?: ReactNode;
  /** One quiet line under the chips: "5 proposals", "4 of 6 voted". */
  meta?: string;
  /**
   * A line under the text that stays even on a compact row: why a question
   * was skipped, which is part of the record.
   */
  note?: string;
  /**
   * In place of the text, while it is being reworded: the edit box. The row
   * keeps its node and its place in the line.
   */
  textSlot?: ReactNode;
  /**
   * The row's own control in its top-right corner — the leader's ⋯ — shown
   * on hover and focus, beside the text rather than under it, so nothing
   * moves when it appears.
   */
  action?: ReactNode;
  /** Tinted under the pointer: a row the leader can act on. */
  hoverable?: boolean;
  /** Can be picked up and moved: the pointer cursor, and no text selection. */
  movable?: boolean;
  /** Being dragged: lifted and following the pointer up and down. */
  dragging?: boolean;
  /** How far the dragged row has travelled from where it was, in pixels. */
  dragOffset?: number;
  /** Where a dragged question would land, if dropped here. */
  dropIndicator?: 'before' | 'after' | null;
  /** Drag and drop wiring, onto the row itself. */
  liProps?: LiHTMLAttributes<HTMLLIElement>;
  /** Anything else on the card. */
  children?: ReactNode;
}

/**
 * One question on the agenda: a node that says what happened to it, beside
 * its text. How far the session has got is the header's progress bar.
 *
 * Past and upcoming questions are compact rows. The question the board is
 * showing is the white card with the accent edge, with its whole text, its
 * status and whatever rides on it.
 *
 * Shared by the live agenda and an ended session's question list, so the two
 * read alike: same node, same card, same chips. What differs is what each one
 * puts in `status`, `extraChips`, `meta` and `children`.
 */
export function AgendaStep({
  number,
  text,
  state,
  focused,
  highlighted = false,
  fresh = false,
  prefix,
  onSelect,
  onTextKeyDown,
  status,
  extraChips,
  meta,
  note,
  textSlot,
  action,
  hoverable = false,
  movable = false,
  dragging = false,
  dragOffset = 0,
  dropIndicator = null,
  liProps,
  children,
}: AgendaStepProps) {
  const stepRef = useRef<HTMLLIElement>(null);
  // A long agenda scrolls, and the board moving to a question below the fold
  // should not leave everyone hunting for it.
  useEffect(() => {
    if ((focused || highlighted) && stepRef.current) revealInList(stepRef.current);
  }, [focused, highlighted]);

  const finished = state === 'answered' || state === 'skipped';
  // A finished question gives way to the ones still to come: two lines at
  // most, and its node says how it ended. The card on screen and the one in
  // play always show their whole text and their status.
  const compact = finished && !focused && !highlighted;
  const showStatus = status && !compact;
  const textClass = `text-left leading-snug wrap-break-word ${compact ? 'line-clamp-2' : ''} ${
    focused ? 'text-[14.5px] font-semibold' : 'text-[12.5px]'
  } ${
    state === 'skipped'
      ? 'text-rt-ink-faint line-through'
      : focused
        ? 'text-rt-ink'
        : finished
          ? 'text-rt-ink-muted'
          : 'text-rt-ink'
  }`;

  return (
    <li
      {...liProps}
      ref={stepRef}
      aria-current={focused ? 'step' : undefined}
      style={
        dragging ? { ...liProps?.style, transform: `translateY(${dragOffset}px)` } : liProps?.style
      }
      className={`group/step relative flex gap-2.5 rounded-2xl border px-2.5 transition-[background-color,border-color,opacity,box-shadow] duration-500 ${
        movable ? 'cursor-pointer select-none' : ''
      } ${dragging ? 'z-10 bg-white shadow-[0_6px_16px_rgb(31_35_40/0.14)] duration-0' : ''} ${
        focused
          ? 'border-rt-secondary bg-white py-3 shadow-[0_1px_2px_rgb(31_35_40/0.05),0_6px_16px_rgb(31_35_40/0.08)]'
          : textSlot
            ? 'border-rt-secondary bg-white py-2.5 shadow-[0_0_0_3px_var(--color-rt-secondary-wash)]'
            : `py-2 ${
                highlighted
                  ? 'border-rt-cool/40 bg-rt-cool-tint/60'
                  : fresh
                    ? 'border-transparent bg-rt-secondary-wash'
                    : `border-transparent ${hoverable ? 'hover:bg-rt-ink/[0.035] focus-within:bg-rt-ink/[0.035]' : ''}`
              }`
      }`}
    >
      {dropIndicator ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-rt-secondary ${
            dropIndicator === 'before' ? '-top-[3px]' : '-bottom-[3px]'
          }`}
        />
      ) : null}
      {/* On the card the node sits level with its status row, which is the
          height of the edit button beside it; elsewhere, with the first line of
          the text. */}
      <span className={`flex shrink-0 ${focused && prefix ? 'h-6 items-center' : ''}`}>
        <StepNode state={state} number={number} editing={Boolean(textSlot)} />
      </span>
      <div className={`flex min-w-0 flex-1 flex-col pt-px ${action && !textSlot ? 'pr-6' : ''}`}>
        {prefix}
        {textSlot ? (
          textSlot
        ) : onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            onKeyDown={onTextKeyDown}
            title={compact ? text : undefined}
            className={`cursor-pointer rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${textClass}`}
          >
            {text}
          </button>
        ) : (
          <p title={compact ? text : undefined} className={textClass}>
            {text}
          </p>
        )}
        {showStatus || extraChips ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {showStatus && status ? (
              <AgendaChip tone={status.tone}>{status.label}</AgendaChip>
            ) : null}
            {extraChips}
          </div>
        ) : status ? (
          <span className="sr-only">{status.label}</span>
        ) : null}
        {note ? (
          <p className="mt-0.5 text-[11px] leading-snug text-rt-ink-muted">
            <span aria-hidden>↳ </span>
            {note}
          </p>
        ) : null}
        {meta && !compact ? (
          <p className="mt-1.5 text-[11px] text-rt-ink-muted tabular-nums">{meta}</p>
        ) : null}
        {children}
      </div>
      {textSlot ? null : action}
    </li>
  );
}

/** The list the steps sit in. Scrolls on its own under the progress header. */
export function AgendaTimeline({ children }: { children: ReactNode }) {
  return (
    <ol className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 py-2">
      {children}
    </ol>
  );
}
