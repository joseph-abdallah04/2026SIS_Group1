import { Check, Eye, SkipForward } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

import type { AgendaStepState } from './agendaSummary';

export type AgendaChipTone = 'cool' | 'warm' | 'neutral' | 'outline';

const CHIP_TONE: Record<AgendaChipTone, string> = {
  cool: 'border-rt-cool/40 bg-rt-cool-tint text-rt-cool-deep',
  warm: 'border-rt-secondary/40 bg-rt-secondary-wash text-rt-secondary-deep',
  neutral: 'border-rt-tertiary/80 bg-rt-surface-sunken text-rt-ink-faint',
  outline: 'border-rt-tertiary bg-white text-rt-ink-muted',
};

/** A question's status, as a small coloured pill under its text. */
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[10px] font-semibold tracking-[0.06em] uppercase ${CHIP_TONE[tone]}`}
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
  pending: 'border-rt-tertiary bg-rt-surface text-rt-ink-faint',
};

function StepNode({ state, number }: { state: AgendaStepState; number: number }) {
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
        <span className="size-2 rounded-full bg-rt-cool motion-safe:animate-pulse" />
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
  /** The question the board is showing: the white card. */
  focused: boolean;
  /**
   * In play but not on screen, while the board looks back at another question:
   * tinted so the controls riding on it are still easy to find.
   */
  highlighted?: boolean;
  /** Nothing below it, so no line runs on from its node. */
  last: boolean;
  /** Present: the question text is a button that puts this question up. */
  onSelect?: () => void;
  /**
   * What happened to it, as a chip under the text. Shown on the cards and on
   * anything still to come; a finished question in the list leaves it to its
   * node and keeps it for screen readers only.
   */
  status?: { label: string; tone: AgendaChipTone } | null;
  /** More chips beside the status, shown whenever given. */
  extraChips?: ReactNode;
  /** Anything else on the card: the board lock, the leader's controls. */
  children?: ReactNode;
}

/**
 * One question on the agenda timeline: a node in the gutter that says what
 * happened to it, joined to the next by a line that fills in as the session
 * gets through them.
 *
 * Shared by the live agenda and an ended session's question list, so the two
 * read alike: same node, same card, same chips. What differs is what each one
 * puts in `status`, `extraChips` and `children`.
 */
export function AgendaStep({
  number,
  text,
  state,
  focused,
  highlighted = false,
  last,
  onSelect,
  status,
  extraChips,
  children,
}: AgendaStepProps) {
  const stepRef = useRef<HTMLLIElement>(null);
  // A long agenda scrolls, and the board moving to a question below the fold
  // should not leave everyone hunting for it.
  useEffect(() => {
    if (focused && stepRef.current) revealInList(stepRef.current);
  }, [focused]);

  const finished = state === 'answered' || state === 'skipped';
  // A finished question gives way to the ones still to come: two lines at
  // most, and its node says how it ended. The card on screen and the one in
  // play always show their whole text and their status.
  const compact = finished && !focused && !highlighted;
  const showStatus = status && !compact;
  const textClass = `text-left text-[12.5px] leading-snug wrap-break-word ${compact ? 'line-clamp-2' : ''} ${
    state === 'skipped'
      ? 'text-rt-ink-faint line-through'
      : focused
        ? 'font-medium text-rt-ink'
        : finished
          ? 'text-rt-ink-muted'
          : 'text-rt-ink'
  }`;

  return (
    <li
      ref={stepRef}
      aria-current={focused ? 'step' : undefined}
      className={`relative flex gap-2.5 rounded-2xl border px-2.5 py-2 transition-colors ${
        focused
          ? 'border-rt-secondary bg-white shadow-sm'
          : highlighted
            ? 'border-rt-cool/40 bg-rt-cool-tint/60'
            : 'border-transparent'
      }`}
    >
      {/* From under this node to just above the next one, across the gap and
          the next card's padding. Gold behind a finished question, so the
          line fills in as the session moves down it. */}
      {last ? null : (
        <span
          aria-hidden
          className={`absolute top-[30px] -bottom-3 left-[19px] w-0.5 rounded-full ${
            finished ? 'bg-rt-secondary/60' : 'bg-rt-tertiary/70'
          }`}
        />
      )}
      <StepNode state={state} number={number} />
      <div className="flex min-w-0 flex-1 flex-col pt-px">
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            title={compact ? text : undefined}
            className={`rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary ${textClass}`}
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
        {children}
      </div>
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
