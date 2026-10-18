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

/**
 * The timer as a phrase, for a line of status text rather than a clock face:
 * "4:12 left" while it runs, "0:42 over" once a discussion runs past zero.
 */
export function phaseTimerPhrase(view: { label: string }): string {
  return view.label.startsWith('+') ? `${view.label.slice(1)} over` : `${view.label} left`;
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
export function PhaseTimer({
  startedAt,
  durationSeconds,
  allowOvertime,
  label,
  compact = false,
  inline = false,
}: PhaseTimerProps & {
  /** Just the time, for a card that already says what it is timing. */
  compact?: boolean;
  /**
   * A phrase in a line of text ("4:12 left"), for the board header's status
   * line, which already says which phase it is timing.
   */
  inline?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt, durationSeconds]);

  const remainingMs = Date.parse(startedAt) + durationSeconds * 1000 - now;
  const view = phaseTimerView(remainingMs, allowOvertime);

  if (inline) {
    const phrase = phaseTimerPhrase(view);
    return (
      <span
        role="timer"
        aria-label={`${label} ${phrase}`}
        className={`tabular-nums ${view.tone === 'over' ? 'font-semibold text-red-600' : ''}`}
      >
        <span className={view.tone === 'warn' ? 'rt-timer-flash font-semibold' : undefined}>
          {phrase}
        </span>
      </span>
    );
  }

  if (compact) {
    return (
      <span
        role="timer"
        aria-label={`${label} ${view.label}`}
        className={`text-[12.5px] font-semibold tabular-nums ${
          view.tone === 'over' ? 'text-red-600' : 'text-rt-ink-muted'
        }`}
      >
        <span className={view.tone === 'warn' ? 'rt-timer-flash' : undefined}>{view.label}</span>
      </span>
    );
  }

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
