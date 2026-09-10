import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  combineTimerSeconds,
  splitTimerSeconds,
  TIMER_SECOND_STEP,
  type TimerDurationParts,
} from '@roundtable/shared/schemas';

interface TimerDurationFieldsProps {
  id: string;
  label: string;
  hint: string;
  maxSeconds: number;
  value: TimerDurationParts;
  onChange: (next: TimerDurationParts) => void;
}

function snapToStep(n: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
  if (step <= 1) return Math.round(clamped);
  const snapped = Math.round(clamped / step) * step;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * One optional session clock as hour / minute / 15-second spinners. Arrows
 * (or the wheel) step the value; typing a number jumps to it. Native `<select>`
 * lists and number-input validation bubbles are both avoided.
 */
export function TimerDurationFields({
  id,
  label,
  hint,
  maxSeconds,
  value,
  onChange,
}: TimerDurationFieldsProps) {
  const maxHours = Math.floor(maxSeconds / 3600);
  const atHourCap = value.hours >= maxHours && maxHours > 0;
  const minuteMax = atHourCap ? 0 : 59;
  const secondMax = atHourCap ? 0 : 45;

  function commit(next: TimerDurationParts) {
    const hours = snapToStep(next.hours, 0, maxHours, 1);
    const capped = hours >= maxHours && maxHours > 0;
    onChange({
      hours,
      minutes: capped ? 0 : snapToStep(next.minutes, 0, 59, 1),
      seconds: capped ? 0 : snapToStep(next.seconds, 0, 45, TIMER_SECOND_STEP),
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-[12.5px] font-medium text-rt-ink">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex overflow-hidden rounded-2xl border border-rt-tertiary bg-rt-surface"
      >
        <UnitSpinner
          id={`${id}-hours`}
          label={`${label} hours`}
          unit="h"
          value={value.hours}
          min={0}
          max={maxHours}
          step={1}
          onChange={(hours) => commit({ ...value, hours })}
        />
        <span aria-hidden className="w-px self-stretch bg-rt-tertiary" />
        <UnitSpinner
          id={`${id}-minutes`}
          label={`${label} minutes`}
          unit="m"
          value={value.minutes}
          min={0}
          max={minuteMax}
          step={1}
          onChange={(minutes) => commit({ ...value, minutes })}
        />
        <span aria-hidden className="w-px self-stretch bg-rt-tertiary" />
        <UnitSpinner
          id={`${id}-seconds`}
          label={`${label} seconds`}
          unit="s"
          value={value.seconds}
          min={0}
          max={secondMax}
          step={TIMER_SECOND_STEP}
          onChange={(seconds) => commit({ ...value, seconds })}
        />
      </div>
      <p className="text-[11px] leading-snug text-rt-ink-faint">{hint}</p>
    </div>
  );
}

function UnitSpinner({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(value);
  const stepByRef = useRef<(direction: 1 | -1) => void>(() => {});
  currentRef.current = value;

  useEffect(() => {
    setDraft(null);
  }, [value]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stepByRef.current(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const shown = snapToStep(value, min, max, step);
  const display = draft ?? String(shown).padStart(2, '0');
  const canDown = shown > min;
  const canUp = shown < max;

  function apply(raw: string) {
    const parsed = raw.trim() === '' ? min : Number.parseInt(raw, 10);
    onChange(snapToStep(Number.isFinite(parsed) ? parsed : min, min, max, step));
    setDraft(null);
  }

  function stepBy(direction: 1 | -1) {
    const next = snapToStep(currentRef.current + direction * step, min, max, step);
    currentRef.current = next;
    onChange(next);
  }
  stepByRef.current = stepBy;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      stepBy(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      stepBy(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(min);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(max);
    } else if (e.key === 'Enter') {
      apply(e.currentTarget.value);
    }
  }

  return (
    <div ref={rootRef} className="flex min-w-0 flex-1 flex-col items-center px-1 pb-1.5 pt-0.5">
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={!canUp}
        onClick={() => stepBy(1)}
        className="flex h-7 w-full items-center justify-center rounded-full text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-25"
      >
        <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <input
        id={id}
        type="text"
        role="spinbutton"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={shown}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={display}
        onFocus={(e) => {
          setDraft(String(shown));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={(e) => apply(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        className="w-full bg-transparent py-0.5 text-center text-[17px] font-semibold tabular-nums text-rt-ink outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-rt-secondary"
      />
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={!canDown}
        onClick={() => stepBy(-1)}
        className="flex h-7 w-full items-center justify-center rounded-full text-rt-ink-muted hover:bg-rt-primary-tint disabled:opacity-25"
      >
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
      </button>
      <span className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        {unit}
      </span>
    </div>
  );
}

export function timerPartsFromSeconds(total: number | null | undefined): TimerDurationParts {
  return splitTimerSeconds(total);
}

export function secondsFromTimerParts(parts: TimerDurationParts): number | null {
  return combineTimerSeconds(parts);
}
