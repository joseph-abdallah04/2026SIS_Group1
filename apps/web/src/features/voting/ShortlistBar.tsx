interface ShortlistBarProps {
  isLeader: boolean;
  count: number;
}

/**
 * Compact F27 chrome in the session header while the leader is still picking.
 * The actual "Proceed to voting" control sits on the board, not up here —
 * a cramped header button was too easy to miss beside End session / mic.
 */
export function ShortlistBar({ isLeader, count }: ShortlistBarProps) {
  if (!isLeader) {
    return (
      <span className="rounded-full border border-rt-secondary/25 bg-white px-3 py-1 text-[10.5px] font-semibold text-rt-secondary-deep shadow-sm">
        Leader is selecting…
      </span>
    );
  }

  return (
    <span className="rounded-full border border-rt-secondary/25 bg-white px-3 py-1 text-[10.5px] font-semibold text-rt-secondary-deep shadow-sm">
      {count} selected
    </span>
  );
}
