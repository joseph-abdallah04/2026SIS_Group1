interface ShortlistBarProps {
  isLeader: boolean;
  count: number;
}

/**
 * F27's word in the board header while the leader is still picking: a phrase
 * in the header's status line ("3 selected", "Leader is selecting…"), not a
 * chip, so it reads as part of the question's state beside its phase.
 * The actual "Proceed to voting" control sits on the board, not up here —
 * a cramped header button was too easy to miss beside End session / mic.
 */
export function ShortlistBar({ isLeader, count }: ShortlistBarProps) {
  return (
    <span className="font-medium text-rt-secondary-deep">
      {isLeader ? `${count} selected` : 'Leader is selecting…'}
    </span>
  );
}
