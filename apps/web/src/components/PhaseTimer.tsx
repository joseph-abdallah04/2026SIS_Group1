import { useEffect, useState } from 'react';
import { TIMER_FLASH_SECONDS } from '@roundtable/shared';

export type PhaseTimerTone = 'count' | 'warn' | 'over';

export function phaseTimerView(
  remainingMs: number,
  allowOvertime: boolean,
): { label: string; tone: PhaseTimerTone } {
  const overtime = remainingMs <= 0;
  if (overtime && !allowOvertime) {
    return { label: '0:00', tone: 'over' };
  }

  const absSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const minutes = Math.floor(absSeconds / 60);
  const seconds = absSeconds % 60;
  const clock = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  if (overtime) {
    return { label: remainingMs === 0 ? '0:00' : `+${clock}`, tone: 'over' };
  }

  return {
    label: clock,
    tone: remainingMs <= TIMER_FLASH_SECONDS * 1000 ? 'warn' : 'count',
  };
}

interface PhaseTimerProps {
  startedAt: string;
  durationSeconds: number;
  /** Discussion keeps counting past zero in red; voting stops at 0:00. */
  allowOvertime: boolean;
  label: string;
}

/**
 * Shared session clock. The deadline is a server timestamp; this only paints
 * remaining time so every screen agrees on the same number.
 */
export function PhaseTimer({ startedAt, durationSeconds, allowOvertime, label }: PhaseTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt, durationSeconds]);

  const remainingMs = Date.parse(startedAt) + durationSeconds * 1000 - now;
  const view = phaseTimerView(remainingMs, allowOvertime);

  return (
    <p
      role="timer"
      aria-label={`${label} ${view.label}`}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold tabular-nums shadow-sm ${
        view.tone === 'over'
          ? 'border-red-200 bg-white text-red-600'
          : 'border-rt-secondary/25 bg-white text-rt-ink'
      }`}
    >
      <span className="text-[10px] font-semibold tracking-[0.12em] text-rt-ink-faint uppercase">
        {label}
      </span>
      <span className={view.tone === 'warn' ? 'rt-timer-flash' : undefined}>{view.label}</span>
    </p>
  );
}
