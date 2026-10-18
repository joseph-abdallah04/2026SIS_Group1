import { useEffect, useState } from 'react';

/** Often enough that a new minute shows within a few seconds of arriving. */
const TICK_MS = 15_000;

/**
 * How long a session has been running, in minutes: a status line is read at a
 * glance, and seconds ticking beside the question would pull the eye for no
 * reason. The discussion countdown is where seconds matter.
 */
export function meetingDuration(elapsedMs: number): string {
  const minutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (minutes < 1) return 'Just started';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * The session's running time, counted from when the leader started it (F09).
 * Every screen counts from the same server timestamp, so they agree. Renders
 * nothing without one.
 */
export function SessionClock({ startedAt }: { startedAt: string | Date | null }) {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(started)) return;
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [started]);

  if (Number.isNaN(started)) return null;

  return (
    <span title="How long the session has been running">
      <span className="sr-only">Session running: </span>
      {meetingDuration(now - started)}
    </span>
  );
}
