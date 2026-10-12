import { useEffect, useRef } from 'react';

/**
 * Asking before a question is skipped: a skipped question cannot be reopened,
 * so one more press confirms it. Nothing else to fill in, so the meeting is
 * not held up.
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
      className="flex flex-col gap-2.5 outline-none"
    >
      <p className="text-[12.5px] font-semibold text-rt-ink">
        Skip Q{questionNumber}?{' '}
        <span className="font-normal text-rt-ink-muted">It can’t be reopened.</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="flex-1 rounded-full bg-rt-ink px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rt-secondary disabled:opacity-60"
        >
          {busy ? 'Skipping…' : 'Skip question'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-2 text-[12.5px] font-medium text-rt-ink-muted hover:text-rt-ink hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
