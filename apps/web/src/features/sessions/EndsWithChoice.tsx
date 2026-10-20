import { Lightbulb, SquareCheckBig, type LucideIcon } from 'lucide-react';

const OPTIONS: { votingEnabled: boolean; label: string; title: string; Icon: LucideIcon }[] = [
  {
    votingEnabled: true,
    label: 'Vote',
    title: 'The team votes on this question',
    Icon: SquareCheckBig,
  },
  {
    votingEnabled: false,
    label: 'Brainstorm',
    title: 'Brainstorm only: the team adds ideas, and nobody votes',
    Icon: Lightbulb,
  },
];

interface EndsWithChoiceProps {
  votingEnabled: boolean;
  onChange: (votingEnabled: boolean) => void;
  disabled?: boolean;
  /** `sm` in the agenda rail, `md` in the setup form. */
  size?: 'sm' | 'md';
  /** Fill the width it is given, each choice taking half. */
  stretch?: boolean;
  /** On a phone, the icons alone: a setup row has no room for the words. */
  iconsOnPhone?: boolean;
  /**
   * `plain`: the chosen one a white pill on the grey track (the agenda).
   * `outlined`: an edged track, the chosen one ringed in the accent (setup).
   */
  look?: 'plain' | 'outlined';
  /** What the choice is about, where nothing on screen names it. */
  'aria-label'?: string;
  /** The words on screen that name it ("Ends with"). */
  'aria-labelledby'?: string;
}

/**
 * F41: how a question finishes, as two choices side by side: a vote, or a
 * brainstorm that ends with the board as it is. The one control wherever the
 * choice is made, setting a session up and adding or editing a question in the
 * agenda, so it reads the same everywhere: the same words and the same icons.
 * Setup draws it outlined, the agenda plain (`look`).
 */
export function EndsWithChoice({
  votingEnabled,
  onChange,
  disabled = false,
  size = 'md',
  stretch = false,
  iconsOnPhone = false,
  look = 'plain',
  ...label
}: EndsWithChoiceProps) {
  const sizing =
    size === 'sm' ? 'h-7 gap-1 px-2.5 text-[11.5px]' : 'h-8 gap-1.5 px-3 text-[12.5px]';
  const outlined = look === 'outlined';
  const chosen = (vote: boolean) =>
    !outlined
      ? 'bg-white text-rt-ink shadow-sm'
      : vote
        ? 'bg-white text-rt-secondary-deep shadow-[0_0_0_1px_rgba(224,163,60,0.6),0_1px_2px_rgba(60,40,20,0.14)]'
        : 'bg-white text-[#9a6a1c] shadow-[0_0_0_1px_rgba(154,106,28,0.4),0_1px_2px_rgba(60,40,20,0.14)]';
  return (
    <div
      role="radiogroup"
      {...label}
      className={`inline-flex shrink-0 rounded-full p-0.5 ${
        outlined ? 'border border-rt-tertiary/70 bg-rt-surface-alt' : 'bg-rt-ink/[0.06]'
      } ${stretch ? 'flex-1' : ''}`}
    >
      {OPTIONS.map(({ votingEnabled: value, label: word, title, Icon }) => {
        const on = votingEnabled === value;
        return (
          <button
            key={word}
            type="button"
            role="radio"
            aria-checked={on}
            title={title}
            disabled={disabled}
            onClick={() => {
              if (!on) onChange(value);
            }}
            className={`flex cursor-pointer items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rt-secondary disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${
              stretch ? 'flex-1' : ''
            } ${on ? chosen(value) : 'text-rt-ink-muted hover:text-rt-ink'}`}
          >
            <Icon aria-hidden size={size === 'sm' ? 12 : 13} />
            <span className={iconsOnPhone ? 'max-sm:sr-only' : undefined}>{word}</span>
          </button>
        );
      })}
    </div>
  );
}
