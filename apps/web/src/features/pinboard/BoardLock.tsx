import { Lock, LockOpen } from 'lucide-react';

/**
 * Whether members may move their own proposals on the question being
 * discussed, under that question in the agenda: a toggle for the leader, and
 * for everyone else the same state to read, so a card that will not drag has
 * its reason in sight.
 *
 * In the agenda because it belongs to the question, like the phase controls
 * beside it. Every question starts locked, and the leader decides again for
 * the next one.
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

  if (!onToggle) {
    return (
      <p
        role="status"
        className="flex items-center gap-1.5 text-[11px] leading-snug text-rt-ink-muted"
      >
        <Icon aria-hidden="true" size={12} strokeWidth={2} className="shrink-0" />
        {locked ? 'Only the leader can move proposals' : 'You can move your own proposals'}
      </p>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={locked}
      disabled={busy}
      onClick={onToggle}
      title={
        locked
          ? 'Only you can move proposals. Unlock to let members move their own.'
          : 'Members can move their own proposals. Lock so only you can.'
      }
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-rt-tertiary bg-white px-2.5 py-[4px] text-[11px] font-semibold text-rt-ink-muted transition-colors hover:border-rt-secondary hover:text-rt-ink focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rt-secondary disabled:opacity-60 aria-pressed:text-rt-ink"
    >
      <Icon aria-hidden="true" size={12} strokeWidth={2} className="shrink-0" />
      {locked ? 'Board locked' : 'Board unlocked'}
    </button>
  );
}
