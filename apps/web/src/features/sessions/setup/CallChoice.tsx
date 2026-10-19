import { Headphones, Lock, PanelsTopLeft, type LucideIcon } from 'lucide-react';

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
 * C2: does this session have a call? Both answers side by side, since neither
 * is "off"; a thumb slides to the one chosen. Real radios underneath, so the
 * arrow keys move between them. The hint follows the choice, and says it is
 * fixed once the room is open.
 */
export function CallChoice({ voiceEnabled, onChange }: CallChoiceProps) {
  const chosen = OPTIONS.find((option) => option.voiceEnabled === voiceEnabled) ?? OPTIONS[0]!;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">Call</legend>
      <div className="relative inline-grid grid-cols-2 self-start rounded-full bg-[#f1ebdf] p-[3px]">
        <span
          aria-hidden
          className={`absolute inset-y-[3px] left-[3px] w-[calc(50%-3px)] rounded-full bg-white shadow-[0_1px_3px_rgba(60,40,20,0.16)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            voiceEnabled ? 'translate-x-full' : ''
          }`}
        />
        {OPTIONS.map(({ voiceEnabled: value, label, Icon }) => {
          const on = value === voiceEnabled;
          return (
            <label key={label} className="relative z-10 cursor-pointer">
              <input
                type="radio"
                name="session-call"
                checked={on}
                onChange={() => onChange(value)}
                className="peer sr-only"
              />
              <span
                className={`flex h-[34px] items-center justify-center gap-[7px] rounded-full px-4 text-[12.5px] font-semibold whitespace-nowrap transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-rt-secondary ${
                  on ? 'text-rt-ink' : 'text-rt-ink-muted hover:text-rt-ink'
                }`}
              >
                <Icon
                  aria-hidden
                  size={15}
                  className={on && value ? 'text-[#2f8f5b]' : undefined}
                />
                {label}
              </span>
            </label>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-rt-ink-muted">
        {chosen.hint}
        <span className="inline-flex items-center gap-1 text-[11px] text-rt-ink-faint">
          <Lock aria-hidden size={11} />
          Locked once the room opens
        </span>
      </p>
    </fieldset>
  );
}
