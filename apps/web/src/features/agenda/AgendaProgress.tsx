import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';

import {
  progressText,
  SEGMENTED_MAX,
  type AgendaStepState,
  type AgendaSummary,
} from './agendaSummary';

const SEGMENT_CLASS: Record<AgendaStepState, string> = {
  answered: 'bg-rt-secondary',
  skipped: 'bg-rt-tertiary/40',
  // The app's "live" colour, as on the header's live dot.
  live: 'bg-rt-cool motion-safe:animate-pulse',
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
        dense ? 'overflow-hidden rounded-full' : vertical ? 'gap-0.5' : 'gap-[3px]'
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
 * still to come — and "2 of 4 done" above it.
 *
 * The same piece heads the live agenda and an ended session's question list,
 * so a past board reads the way the session did. `vertical` is the slim
 * version for a collapsed rail's strip.
 */
export function AgendaProgress({
  summary,
  vertical = false,
}: {
  summary: AgendaSummary;
  vertical?: boolean;
}) {
  const { done, skipped, total, steps } = summary;
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
    <div className="-mx-3 shrink-0 border-b border-rt-tertiary/70 px-3 pt-2.5 pb-3">
      <div aria-hidden className="mb-2 flex items-baseline justify-between gap-2">
        {allDone ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-rt-secondary-deep">
            <Check size={12} strokeWidth={3} className="shrink-0 self-center" />
            All done
          </span>
        ) : (
          <span className="text-[11px] text-rt-ink-muted">
            <span className="font-semibold text-rt-ink tabular-nums">{done}</span> of{' '}
            <span className="tabular-nums">{total}</span> done
          </span>
        )}
        {skipped > 0 ? (
          <span className="text-[10.5px] text-rt-ink-faint tabular-nums">{skipped} skipped</span>
        ) : null}
      </div>
      <div {...meter}>
        <Segments steps={steps} vertical={false} />
      </div>
    </div>
  );
}
