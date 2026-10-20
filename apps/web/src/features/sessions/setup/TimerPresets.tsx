import { useState } from 'react';

import {
  secondsFromTimerParts,
  TimerDurationFields,
  timerPartsFromSeconds,
} from '../TimerDurationFields';
import { InfoTip } from './InfoTip';
import { formatTimer } from './setupSummary';

interface TimerPresetsProps {
  id: string;
  /** "Discussion", "Voting". */
  label: string;
  /** The full explanation, behind the ⓘ. */
  info: string;
  /** One short line under the chips. */
  hint: string;
  /** The usual lengths in seconds, 0 for off. */
  presets: readonly number[];
  maxSeconds: number;
  /** `null` is off. */
  value: number | null;
  onChange: (seconds: number | null) => void;
}

/**
 * TM2: one optional session clock as a click on its usual lengths, with
 * Custom… opening the spinners for anything else. A value that is none of the
 * presets (from a template, a draft, or set by hand) shows on the Custom chip
 * itself, and the spinners stay shut until that chip is clicked.
 */
export function TimerPresets({
  id,
  label,
  info,
  hint,
  presets,
  maxSeconds,
  value,
  onChange,
}: TimerPresetsProps) {
  const seconds = value ?? 0;
  const isPreset = presets.includes(seconds);
  const [customOpen, setCustomOpen] = useState(false);
  const custom = customOpen || !isPreset;
  const chip = (on: boolean) =>
    `h-[30px] rounded-full border px-2.5 text-[12.5px] font-semibold tabular-nums transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none ${
      on
        ? 'border-rt-secondary bg-rt-secondary-wash text-rt-secondary-deep shadow-[0_0_0_2px_rgba(224,163,60,0.28)]'
        : 'border-[#e3d9c6] bg-white text-rt-ink-muted hover:border-rt-secondary hover:text-rt-ink'
    }`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-rt-ink">
        <span id={`${id}-label`}>{label}</span>
        <InfoTip label={`About the ${label.toLowerCase()} timer`} text={info} />
        <span className="ml-auto text-[12px] font-semibold text-rt-secondary-deep tabular-nums">
          {formatTimer(value)}
        </span>
      </div>
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-[5px]">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={!custom && seconds === preset}
            onClick={() => {
              setCustomOpen(false);
              onChange(preset || null);
            }}
            className={chip(!custom && seconds === preset)}
          >
            {formatTimer(preset, 'short')}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={custom}
          aria-expanded={customOpen}
          aria-controls={customOpen ? `${id}-custom-panel` : undefined}
          onClick={() => setCustomOpen(true)}
          className={chip(custom)}
        >
          {custom && !isPreset ? formatTimer(seconds, 'short') : 'Custom…'}
        </button>
      </div>
      {customOpen ? (
        <div id={`${id}-custom-panel`} className="self-start">
          <TimerDurationFields
            id={`${id}-custom`}
            label={`${label} timer`}
            hideLabel
            maxSeconds={maxSeconds}
            value={timerPartsFromSeconds(value)}
            onChange={(parts) => onChange(secondsFromTimerParts(parts))}
          />
        </div>
      ) : null}
      <p className="text-[11.5px] leading-snug text-rt-ink-faint">{hint}</p>
    </div>
  );
}
