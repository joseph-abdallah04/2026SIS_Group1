import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';

import { closingFades } from '../../lib/motion';
import { hintKeyFor, isHintRetired, retireHint } from './firstProposalHintStorage';

/**
 * How long an open board is on screen before the hint rises. Long enough
 * that it arrives as its own event rather than one more thing popping in with
 * the header, the roster and the voice connection; short enough that somebody
 * quick does not reach for a tool first and never see it.
 */
export const HINT_DELAY_MS = 1200;
/** How long it takes to retract; the same as `.rt-hint-retract`. */
export const HINT_EXIT_MS = 170;

interface FirstProposalHintProps {
  sessionId: string;
  /** Null until the join snapshot lands; the hint waits for it, since it is remembered per person. */
  viewerId: string | null;
  /** The board is taking proposals (F25). */
  boardOpen: boolean;
  isLive: boolean;
  /** A creative tool is open, and its popup rises from the same spot. */
  toolOpen: boolean;
}

type Phase = 'hidden' | 'shown' | 'leaving';

/**
 * "Propose your first idea", said once, from the toolbar it is about.
 *
 * An empty board used to be covered by a plate explaining what could go on it,
 * which hid the board itself. Now the board is simply there, and this bubble
 * rises out of the creative toolbar to point at where proposals start.
 *
 * It is for the start of a meeting, and about this person's own first idea,
 * so what anyone else has already put on the board does not matter to it. It
 * retires for the session — for this person — when it is closed or when they
 * open a tool, because whoever did that has found the tools.
 *
 * It sits inside the toolbar's wrapper, so it centres over the toolbar and
 * anchors left when the toolbar does, with no measuring.
 */
export function FirstProposalHint({
  sessionId,
  viewerId,
  boardOpen,
  isLive,
  toolOpen,
}: FirstProposalHintProps) {
  const key = viewerId ? hintKeyFor(sessionId, viewerId) : null;
  const [phase, setPhase] = useState<Phase>('hidden');
  // Mirrors the stored flag, so retiring re-renders without waiting on storage.
  const [retiredKey, setRetiredKey] = useState<string | null>(null);
  const retired = key === null || retiredKey === key || isHintRetired(key);
  const wanted = boardOpen && isLive && !toolOpen && !retired;

  const retire = useCallback(() => {
    if (!key) return;
    retireHint(key);
    setRetiredKey(key);
  }, [key]);

  // Opening a tool retires it too, not only the close button.
  useEffect(() => {
    if (key && !retired && toolOpen) retire();
  }, [key, retire, retired, toolOpen]);

  // Rise a moment after the board opens. With less motion asked for there is no
  // entrance to wait for, so it is simply there.
  useEffect(() => {
    if (!wanted || phase !== 'hidden') return;
    if (!closingFades()) {
      setPhase('shown');
      return;
    }
    const timer = setTimeout(() => setPhase('shown'), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, wanted]);

  // And go once it is no longer wanted. A tool opening removes it at once: the
  // tool's popup rises from the same spot, and the two would cross.
  useEffect(() => {
    if (wanted || phase !== 'shown') return;
    setPhase(toolOpen || !closingFades() ? 'hidden' : 'leaving');
  }, [phase, toolOpen, wanted]);

  // Removed once the retract has played, as StickyEditor removes its popup.
  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => setPhase('hidden'), HINT_EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === 'hidden') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      // Centred over the toolbar, and left-anchored with it at the same stage
      // (see the toolbar row in PinboardCanvas). The width is capped by the
      // board, not the window, so it never runs off a narrow board.
      className="absolute bottom-full left-1/2 mb-3.5 w-max max-w-[min(19rem,calc(100cqw-3rem))] -translate-x-1/2 @max-[48rem]/board:left-0 @max-[48rem]/board:translate-x-0"
    >
      <div
        // Grown from, and retracted into, the arrow's tip.
        className={`relative flex origin-bottom items-start gap-3 rounded-2xl border border-rt-secondary/35 bg-linear-to-b from-rt-secondary-wash to-rt-surface py-3 pr-9 pl-3 shadow-[0_4px_18px_rgba(8,12,21,0.12)] @max-[48rem]/board:origin-[1.65rem_100%] @max-[36rem]/board:origin-[1.4rem_100%] ${
          phase === 'leaving' ? 'rt-hint-retract' : 'rt-hint-rise'
        }`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rt-surface text-rt-secondary shadow-sm ring-1 ring-rt-secondary/30">
          <Lightbulb aria-hidden="true" size={16} strokeWidth={2} />
        </span>
        <div className="min-w-0 pt-px">
          <p className="text-[13px] leading-snug font-semibold text-rt-ink">
            Propose your first idea
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-rt-ink-muted">
            Start with a <span className="font-medium text-rt-ink">Sticky</span> or open the{' '}
            <span className="font-medium text-rt-ink">Studio</span>.
          </p>
        </div>

        <button
          type="button"
          onClick={retire}
          aria-label="Dismiss tip"
          title="Dismiss"
          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-rt-ink-faint transition-colors hover:bg-rt-secondary/15 hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <X aria-hidden="true" size={14} strokeWidth={2.2} />
        </button>

        {/* The pointer: a square turned on its corner, half tucked under the
            card. Only its outer two edges are bordered, and it is painted
            after the card so it covers the card's bottom border where they
            meet. Over Sticky once the toolbar anchors left. */}
        <span
          aria-hidden="true"
          className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-br-[3px] border-r border-b border-rt-secondary/35 bg-rt-surface @max-[48rem]/board:left-[1.65rem] @max-[36rem]/board:left-[1.4rem]"
        />
      </div>
    </div>
  );
}
