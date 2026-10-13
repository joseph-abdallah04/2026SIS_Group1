import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

import {
  progressText,
  SEGMENTED_MAX,
  type AgendaStepState,
  type AgendaSummary,
} from './agendaSummary';

const SEGMENT_CLASS: Record<AgendaStepState, string> = {
  // The same colours as their nodes in the list below.
  answered: 'bg-rt-secondary',
  skipped: 'bg-rt-tertiary/40',
  // The app's "live" colour, as on the live question's node in the list.
  live: 'bg-rt-cool',
  pending: 'bg-rt-tertiary/50',
};

/** Hatched, so a skipped question reads as "passed over", not as a gap. */
const SKIPPED_STYLE: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(135deg, var(--color-rt-tertiary) 0 1.5px, transparent 1.5px 4px)',
};

function Segments({ steps, vertical }: { steps: AgendaStepState[]; vertical: boolean }) {
  // One segment per question while they are wide enough to tell apart, then
  // a single bar: the same colours in the same order, without the gaps.
  const dense = steps.length > SEGMENTED_MAX;
  return (
    <div
      className={`flex ${vertical ? 'w-1.5 flex-col' : 'h-1.5 w-full'} ${
        dense ? 'overflow-hidden rounded-full' : vertical ? 'gap-0.5' : 'gap-1'
      }`}
      style={vertical ? { height: Math.min(steps.length * 12, 144) } : undefined}
    >
      {steps.map((step, index) => (
        <span
          key={index}
          className={`min-h-0 min-w-0 flex-1 ${dense ? '' : 'rounded-full'} ${SEGMENT_CLASS[step]}`}
          style={step === 'skipped' ? SKIPPED_STYLE : undefined}
        />
      ))}
    </div>
  );
}

/**
 * How far through its agenda the session is: one segment per question,
 * coloured by what happened to it — answered, skipped, being worked on, or
 * still to come.
 *
 * Above it, which question the room is on ("Question 3 of 5") while one is in
 * play, and how many are finished otherwise. That is the question in play, not
 * the one the board happens to be showing: the leader can put an earlier
 * question back up without the session going backwards.
 *
 * The same piece heads the live agenda and an ended session's question list,
 * so a past board reads the way the session did. `vertical` is the slim
 * version for a collapsed rail's strip.
 */
export function AgendaProgress({
  summary,
  current,
  vertical = false,
}: {
  summary: AgendaSummary;
  /** One-based position of the question in play, if one is. */
  current?: number;
  vertical?: boolean;
}) {
  const { done, total, steps } = summary;
  if (total === 0) return null;
  const allDone = done === total;

  const meter = {
    role: 'progressbar' as const,
    'aria-label': 'Agenda progress',
    'aria-valuemin': 0,
    'aria-valuemax': total,
    'aria-valuenow': done,
    'aria-valuetext': progressText(summary),
  };

  if (vertical) {
    return (
      <div {...meter} className="flex flex-col items-center gap-1.5">
        <Segments steps={steps} vertical />
        <span aria-hidden className="text-[10px] font-semibold text-rt-ink-faint tabular-nums">
          {done}/{total}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div aria-hidden className="flex items-baseline gap-2">
        {allDone ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold text-rt-secondary-deep">
            <Check size={12} strokeWidth={3} className="shrink-0 self-center" />
            All done
          </span>
        ) : current !== undefined ? (
          <span className="text-[14px] font-semibold text-rt-ink">
            Question <span className="tabular-nums">{current}</span>{' '}
            <span className="font-normal text-rt-ink-muted">
              of <span className="tabular-nums">{total}</span>
            </span>
          </span>
        ) : (
          <span className="text-[14px] font-semibold text-rt-ink">
            <span className="tabular-nums">{done}</span>{' '}
            <span className="font-normal text-rt-ink-muted">
              of <span className="tabular-nums">{total}</span> done
            </span>
          </span>
        )}
      </div>
      <div {...meter}>
        <Segments steps={steps} vertical={false} />
      </div>
    </div>
  );
}
