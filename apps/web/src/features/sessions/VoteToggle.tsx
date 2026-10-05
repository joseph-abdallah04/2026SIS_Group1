import { Check } from 'lucide-react';

interface VoteToggleProps {
  votingEnabled: boolean;
  onChange: (votingEnabled: boolean) => void;
  /** Names the question, e.g. "Vote on question 2" — the visible text is only "Vote". */
  label: string;
  disabled?: boolean;
  /** `sm` for the agenda rail, where rows are tighter than the setup form. */
  size?: 'md' | 'sm';
}

/**
 * F41: whether a question goes to a vote. A pressed/unpressed pill — the app's
 * toggle idiom (see the drawing editor's Pen/Eraser) — rather than a checkbox.
 * The word stays "Vote" either way so the control never renames itself; the
 * tick and gold wash say it is on, the struck-through word says it is off.
 */
export function VoteToggle({
  votingEnabled,
  onChange,
  label,
  disabled = false,
  size = 'md',
}: VoteToggleProps) {
  const sizing = size === 'sm' ? 'h-6 gap-1 px-2 text-[10px]' : 'h-8 gap-1.5 px-3 text-[11px]';
  return (
    <button
      type="button"
      aria-pressed={votingEnabled}
      aria-label={label}
      title={votingEnabled ? 'The team votes on this question' : 'Brainstorm only — no vote'}
      disabled={disabled}
      onClick={() => onChange(!votingEnabled)}
      className={`flex shrink-0 items-center rounded-full border border-dashed border-rt-tertiary font-semibold text-rt-ink-faint hover:bg-rt-primary-tint focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none disabled:opacity-50 aria-pressed:border-solid aria-pressed:border-rt-secondary aria-pressed:bg-rt-secondary-wash aria-pressed:text-rt-secondary-deep ${sizing}`}
    >
      {votingEnabled ? <Check aria-hidden="true" size={size === 'sm' ? 11 : 13} /> : null}
      <span className={votingEnabled ? undefined : 'line-through'}>Vote</span>
    </button>
  );
}

/**
 * The read-only face of the same choice: marks a brainstorm-only question
 * wherever the agenda is listed for people who cannot change it. Voting
 * questions get no tag — a vote is what a question does by default.
 */
export function NoVoteTag() {
  return (
    <span className="shrink-0 rounded-full border border-rt-tertiary px-1.5 py-px text-[10px] font-semibold tracking-[0.04em] text-rt-ink-faint uppercase">
      No vote
    </span>
  );
}
