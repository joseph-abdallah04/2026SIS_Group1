import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

import { TOOL_LABEL } from '../toolbar/CreativeToolbar';

/** How long a refused change stays said, above the bar. */
const ERROR_MS = 4000;

/**
 * Whether members may move their own proposals on the question being
 * discussed: a toggle for the leader, and for everyone else the same state to
 * read, so a card that will not drag has its reason in sight.
 *
 * On the board, in its navigation bar beside Fit: it is a rule about the
 * board, and the board is where somebody looks when a card will not move.
 * Every question starts locked, and the leader decides again for the next one.
 */
export function BoardLock({
  locked,
  onToggle,
  busy,
}: {
  locked: boolean;
  /** The leader's; absent for everyone else, who can only see the state. */
  onToggle?: () => void;
  busy: boolean;
}) {
  const Icon = locked ? Lock : LockOpen;
  const explained = locked
    ? 'Only the leader can move proposals'
    : 'You can move your own proposals';

  if (!onToggle) {
    return (
      <span
        role="status"
        title={explained}
        className="flex h-9 min-w-9 items-center justify-center gap-1.5 px-2.5 text-[12px] font-semibold text-rt-ink-muted"
      >
        <Icon aria-hidden="true" size={15} strokeWidth={2} className="shrink-0" />
        <span className="sr-only">{explained}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={locked}
      aria-label={locked ? 'Board locked' : 'Board unlocked'}
      disabled={busy}
      onClick={onToggle}
      title={
        locked
          ? 'Only you can move proposals. Unlock to let members move their own.'
          : 'Members can move their own proposals. Lock so only you can.'
      }
      className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold text-rt-ink-muted transition-colors hover:bg-rt-primary-tint hover:text-rt-ink focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 aria-pressed:text-rt-ink"
    >
      <Icon aria-hidden="true" size={15} strokeWidth={2} className="shrink-0" />
      <span aria-hidden="true" className={TOOL_LABEL}>
        {locked ? 'Locked' : 'Unlocked'}
      </span>
    </button>
  );
}

/**
 * The lock as the board shows it: the leader's change held while it is on its
 * way — the lock itself only changes when the room hears about it — and a
 * refusal said above the bar for a moment.
 */
export function BoardLockControl({
  locked,
  onToggle,
}: {
  locked: boolean;
  onToggle?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const fade = window.setTimeout(() => setError(null), ERROR_MS);
    return () => window.clearTimeout(fade);
  }, [error]);

  const toggle = onToggle
    ? () => {
        setBusy(true);
        setError(null);
        onToggle()
          .catch((err: unknown) =>
            setError(err instanceof Error ? err.message : 'Could not change the board lock'),
          )
          .finally(() => setBusy(false));
      }
    : undefined;

  return (
    <span className="relative flex">
      <BoardLock locked={locked} onToggle={toggle} busy={busy} />
      {error ? (
        <span
          role="alert"
          className="absolute bottom-full left-0 mb-2 w-max max-w-64 rounded-lg border border-rt-tertiary bg-white px-2.5 py-1.5 text-[11px] leading-snug text-red-600 shadow-sm"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
