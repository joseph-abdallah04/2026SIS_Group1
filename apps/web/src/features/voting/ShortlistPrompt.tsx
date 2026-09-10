import { SHORTLIST_MAX, SHORTLIST_MIN } from '@roundtable/shared';

interface ShortlistPromptProps {
  count: number;
  busy: boolean;
  error: string | null;
  onProceed: () => void;
  onClear: () => void;
}

/**
 * Leader-only bar on the board during shortlisting: pick cards with the ticks,
 * then proceed. Sits just above the footer so it is next to the frozen toolbar
 * rather than competing with End session in the header.
 */
export function ShortlistPrompt({ count, busy, error, onProceed, onClear }: ShortlistPromptProps) {
  const canStart = count >= SHORTLIST_MIN && count <= SHORTLIST_MAX;

  return (
    <div className="pointer-events-auto flex max-w-[min(36rem,calc(100%-2rem))] flex-wrap items-center justify-center gap-3 rounded-full border border-rt-secondary/40 bg-white px-4 py-2 shadow-[0_8px_28px_rgba(8,12,21,0.16)]">
      <p className="text-[12.5px] font-medium text-rt-ink">
        {count === 0
          ? `Select ${SHORTLIST_MIN}–${SHORTLIST_MAX} proposals, then proceed`
          : `${count} selected · pick ${SHORTLIST_MIN}–${SHORTLIST_MAX}`}
      </p>
      <button
        type="button"
        onClick={onClear}
        disabled={busy || count === 0}
        className="text-[12px] font-medium text-rt-ink-muted hover:underline disabled:opacity-50"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onProceed}
        disabled={busy || !canStart}
        title={
          canStart
            ? 'Open the ballot with these proposals'
            : `Select ${SHORTLIST_MIN}–${SHORTLIST_MAX} proposals`
        }
        className="rounded-full bg-rt-secondary px-3.5 py-1.5 text-[12.5px] font-semibold text-rt-ink hover:bg-rt-secondary-deep hover:text-white disabled:opacity-60"
      >
        {busy ? 'Working…' : 'Proceed to voting'}
      </button>
      {error ? (
        <span className="max-w-[14rem] truncate text-[11px] text-red-600">{error}</span>
      ) : null}
    </div>
  );
}
