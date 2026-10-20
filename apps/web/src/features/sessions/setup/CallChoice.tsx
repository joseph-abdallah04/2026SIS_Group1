import { Headphones, PanelsTopLeft, type LucideIcon } from 'lucide-react';

interface CallChoiceProps {
  voiceEnabled: boolean;
  onChange: (voiceEnabled: boolean) => void;
}

/** In the order shown: no call first, as new sessions start on it. */
const OPTIONS: { voiceEnabled: boolean; label: string; hint: string; Icon: LucideIcon }[] = [
  {
    voiceEnabled: false,
    label: 'No call',
    hint: 'Everyone works on the board, with no audio.',
    Icon: PanelsTopLeft,
  },
  {
    voiceEnabled: true,
    label: 'Live call',
    hint: 'Everyone talks live while they work the board.',
    Icon: Headphones,
  },
];

/**
 * C2: does this session have a call? Both answers side by side as cards,
 * since neither is "off", each saying what it means, so the choice is made
 * knowing what it does. Real radios underneath, so the arrow keys move
 * between them. That it is fixed once the room is open is said by the card
 * the choice sits in.
 */
export function CallChoice({ voiceEnabled, onChange }: CallChoiceProps) {
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <legend className="sr-only">Call</legend>
      {OPTIONS.map(({ voiceEnabled: value, label, hint, Icon }) => {
        const on = value === voiceEnabled;
        return (
          <label
            key={label}
            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-rt-secondary ${
              on
                ? 'border-rt-secondary bg-rt-secondary-wash'
                : 'border-rt-tertiary/70 bg-white hover:border-rt-ink-faint'
            }`}
          >
            <input
              type="radio"
              name="session-call"
              checked={on}
              onChange={() => onChange(value)}
              className="peer sr-only"
            />
            {/* The radio as it is drawn: a ring, filled in the accent once chosen. */}
            <span
              aria-hidden
              className={`mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                on ? 'border-rt-secondary' : 'border-rt-tertiary'
              }`}
            >
              {on ? <span className="size-2 rounded-full bg-rt-secondary" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14px] font-semibold text-rt-ink">
                <Icon
                  aria-hidden
                  size={15}
                  className={on && value ? 'text-[#2f8f5b]' : 'text-rt-ink-muted'}
                />
                {label}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-rt-ink-muted">{hint}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
