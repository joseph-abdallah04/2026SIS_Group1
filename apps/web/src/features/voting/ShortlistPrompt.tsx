import { useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { SHORTLIST_MAX, SHORTLIST_MIN } from '@roundtable/shared';

import { TOOL_LABEL } from '../toolbar/CreativeToolbar';

interface ShortlistPromptProps {
  count: number;
  busy: boolean;
  error: string | null;
  /**
   * How many picks have been refused for being past `SHORTLIST_MAX`. Each
   * increase flashes the counter; the number itself is never shown.
   */
  limitHits: number;
  onProceed: () => void;
  onClear: () => void;
  onBack: () => void;
}

/** Shown from the 48rem stage down to the icon stage, and not either side of it. */
const SHORT_LABEL = 'hidden @max-[48rem]/board:inline @max-[36rem]/board:hidden';
/** Shown only at the icon stage. */
const ICON_ONLY = 'hidden @max-[36rem]/board:block';
const SECONDARY_BUTTON =
  'flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2.5 text-[12px] font-medium text-rt-ink-muted transition-colors hover:bg-rt-secondary-wash hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-rt-ink-muted @max-[36rem]/board:px-0';

/**
 * Leader-only bar on the board during shortlisting: pick cards with the ticks,
 * then proceed. It takes the floating toolbar's place while the board is
 * closed, so the leader has one bar at the foot of the board rather than this
 * stacked on top of the "proposals are locked" message.
 *
 * Always one line. The status is a plain counter, "Selected 3/6". A pick past
 * the limit flashes that counter red rather than putting a sentence in its
 * place, which a narrow bar would only cut short. Any other refusal (the
 * connection dropping, say) does take the counter's place, because that one
 * has to be read; the next pick or clear resets it.
 *
 * On a narrow board it shrinks in the same stages as the creative toolbar,
 * against the same `board` container: shorter words below 48rem, then icons
 * for Back and Clear below 36rem. Proceed keeps words at every stage, because
 * it is the one thing this bar is for. Every button keeps its full name for
 * assistive tech whatever is drawn.
 */
export function ShortlistPrompt({
  count,
  busy,
  error,
  limitHits,
  onProceed,
  onClear,
  onBack,
}: ShortlistPromptProps) {
  const canStart = count >= SHORTLIST_MIN && count <= SHORTLIST_MAX;

  // A flash for each refused pick after this bar appeared. Compared with the
  // count seen last render rather than with zero, because the hook keeps
  // counting across shortlists and this bar mounts fresh for each one. Set
  // during render, not in an effect, so the flash starts on the same paint.
  const [seenHits, setSeenHits] = useState(limitHits);
  const [flashKey, setFlashKey] = useState(0);
  const [flashing, setFlashing] = useState(false);
  if (limitHits !== seenHits) {
    setSeenHits(limitHits);
    if (limitHits > seenHits) {
      setFlashKey((key) => key + 1);
      setFlashing(true);
    }
  }

  return (
    <div className="pointer-events-auto flex h-11 max-w-[calc(100cqw-15.5rem)] min-w-0 items-center gap-3 rounded-full border border-rt-secondary/40 bg-white pr-1 pl-2 whitespace-nowrap shadow-[0_8px_28px_rgba(8,12,21,0.16)] @max-[36rem]/board:gap-1 @max-[36rem]/board:pl-1">
      <p role="status" className="min-w-0 truncate text-[12.5px] font-medium tabular-nums">
        {error ? (
          <span className="pl-2 text-red-600">{error}</span>
        ) : (
          // Keyed so a pick refused mid-flash restarts it rather than being
          // swallowed by the one already running.
          <span
            key={flashKey}
            onAnimationEnd={() => setFlashing(false)}
            className={`inline-block rounded-full px-2 py-0.5 text-rt-ink ${
              flashing ? 'rt-shortlist-flash' : ''
            }`}
          >
            {/* Kept whole for screen readers once it is shortened on screen. */}
            <span className="@max-[36rem]/board:sr-only">
              Selected {count}/{SHORTLIST_MAX}
            </span>
            <span aria-hidden="true" className={ICON_ONLY}>
              {count}/{SHORTLIST_MAX}
            </span>
            {/* The flash says why nothing was ticked to anyone who can see it;
                this says it to anyone who cannot. */}
            {flashing ? <span className="sr-only">. At most {SHORTLIST_MAX} proposals</span> : null}
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onBack}
        disabled={busy}
        aria-label="Back to discussion"
        className={SECONDARY_BUTTON}
      >
        <span className="@max-[48rem]/board:hidden">Back to discussion</span>
        <span className={SHORT_LABEL}>Back</span>
        <Undo2 aria-hidden="true" size={16} strokeWidth={1.8} className={ICON_ONLY} />
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy || count === 0}
        aria-label="Clear"
        className={SECONDARY_BUTTON}
      >
        <span className={TOOL_LABEL}>Clear</span>
        <X aria-hidden="true" size={16} strokeWidth={1.8} className={ICON_ONLY} />
      </button>
      <span
        className={`shrink-0 transition-opacity duration-300 ease-out ${
          canStart && !busy ? 'opacity-100' : 'opacity-45'
        }`}
      >
        <button
          type="button"
          onClick={onProceed}
          disabled={busy || !canStart}
          aria-busy={busy}
          aria-label="Proceed to voting"
          title={
            canStart
              ? 'Open the ballot with these proposals'
              : `Select ${SHORTLIST_MIN}–${SHORTLIST_MAX} proposals`
          }
          className="flex h-9 items-center rounded-full bg-rt-secondary px-3.5 text-[12.5px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:pointer-events-none"
        >
          <span className="@max-[48rem]/board:hidden">Proceed to voting</span>
          <span className={SHORT_LABEL}>Proceed</span>
          <span className={ICON_ONLY}>Vote</span>
        </button>
      </span>
    </div>
  );
}
