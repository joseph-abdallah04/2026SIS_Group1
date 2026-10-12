import { useEffect, useRef, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

import { TOOL_LABEL } from '../toolbar/CreativeToolbar';

/** How long a refused change stays said, under the pill. */
const ERROR_MS = 4000;
/** How long the room is told the lock changed. */
const TOAST_MS = 4500;

/**
 * Whether members may move their own proposals on the question being
 * discussed: a toggle for the leader, and for everyone else the same state to
 * read, so a card that will not drag has its reason in sight.
 *
 * On the board, as its own pill in the top-right corner: it is a rule about
 * the board, and the leader's to set.
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
 * refusal said under the pill for a moment.
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
          className="absolute top-full right-0 mt-2 w-max max-w-64 rounded-lg border border-rt-tertiary bg-white px-2.5 py-1.5 text-[11px] leading-snug text-red-600 shadow-sm"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Tells the room the leader just locked or unlocked the board, for a moment,
 * at the top of the board: a card that suddenly will not move, or suddenly
 * will, should not be a mystery.
 *
 * Only when the lock changes on the question the board is showing. Moving to
 * another question is not a change — every question starts locked — so that
 * says nothing. Not for the leader, who just pressed it.
 */
export function BoardLockToast({
  questionId,
  locked,
  enabled,
}: {
  questionId: string | null;
  locked: boolean;
  /** Members on an open board; never the leader. */
  enabled: boolean;
}) {
  const [shown, setShown] = useState<{ locked: boolean; key: number } | null>(null);
  const last = useRef<{ questionId: string | null; locked: boolean }>({ questionId, locked });

  useEffect(() => {
    const before = last.current;
    last.current = { questionId, locked };
    if (!enabled || before.questionId !== questionId || before.locked === locked) return;
    setShown({ locked, key: Date.now() });
  }, [questionId, locked, enabled]);

  useEffect(() => {
    if (!shown) return;
    const fade = window.setTimeout(() => setShown(null), TOAST_MS);
    return () => window.clearTimeout(fade);
  }, [shown]);

  // The live region stays mounted and only its words change, so screen
  // readers hear it.
  return (
    <div role="status" className="flex justify-center">
      {shown ? (
        <p
          key={shown.key}
          className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-rt-ink px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_6px_20px_rgba(8,12,21,0.25)] motion-safe:animate-[rt-toast-in_180ms_ease-out]"
        >
          {shown.locked ? (
            <Lock
              aria-hidden="true"
              size={14}
              strokeWidth={2.25}
              className="shrink-0 text-rt-secondary"
            />
          ) : (
            <LockOpen
              aria-hidden="true"
              size={14}
              strokeWidth={2.25}
              className="shrink-0 text-rt-secondary"
            />
          )}
          {shown.locked
            ? 'The leader locked the board. Only they can move cards'
            : 'The leader unlocked the board. You can move your own cards'}
        </p>
      ) : null}
    </div>
  );
}
