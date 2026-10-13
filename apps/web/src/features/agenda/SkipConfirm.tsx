import { useEffect, useRef } from 'react';

/**
 * Asking before a question is skipped: a skipped question cannot be reopened,
 * so one more press confirms it. Nothing else to fill in, so the meeting is
 * not held up. It sits in the card under the question, which the card's pill
 * has already turned into "Skip this question?".
 */
export function SkipConfirm({
  questionNumber,
  busy,
  onSkip,
  onCancel,
}: {
  questionNumber: number;
  busy: boolean;
  onSkip: () => void;
  onCancel: () => void;
}) {
  // The confirmation itself takes focus, so Escape puts it away and Tab
  // reaches its buttons next.
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label={`Skip question ${questionNumber}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
      className="flex flex-col gap-2 outline-none"
    >
      {/* Sized so the card asking keeps the height of the card it replaces:
          two short lines and a 32px row take the room of the 40px button and
          the link under it. */}
      <p className="min-h-[33px] text-[12px] leading-snug text-rt-ink-muted">
        It can’t be reopened. Proposals stay on the board.
      </p>
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold text-[#475467] transition-colors hover:bg-[#EFEDE8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DFA243]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="inline-flex h-8 items-center rounded-full bg-rt-ink px-4 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DFA243] disabled:opacity-60"
        >
          {busy ? 'Skipping…' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
