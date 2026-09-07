import type { SeatSwatch } from './waitingRoomSeats';

interface WaitingRoomSeatProps {
  displayName: string;
  initials: string;
  swatch: SeatSwatch;
  isLeader: boolean;
  justJoined: boolean;
  leaving: boolean;
  x: number;
  y: number;
  onArriveEnd?: () => void;
  onLeaveEnd?: () => void;
}

/**
 * One head around the tabletop. Name is a hover/focus tooltip so the rim
 * stays initials-only.
 */
export function WaitingRoomSeat({
  displayName,
  initials,
  swatch,
  isLeader,
  justJoined,
  leaving,
  x,
  y,
  onArriveEnd,
  onLeaveEnd,
}: WaitingRoomSeatProps) {
  const namePlacement = y < 55 ? 'below' : 'above';

  return (
    <div
      className="rt-waiting-seat"
      data-just-joined={justJoined ? 'true' : undefined}
      data-leaving={leaving ? 'true' : undefined}
      style={{ left: `${x}%`, top: `${y}%` }}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (justJoined) onArriveEnd?.();
        if (leaving) onLeaveEnd?.();
      }}
    >
      {isLeader && (
        <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.08em] text-rt-secondary-deep">
          Leader
        </span>
      )}
      <button
        type="button"
        aria-label={isLeader ? `${displayName}, Leader` : displayName}
        className={`rt-waiting-seat-bubble ${isLeader ? 'rt-waiting-seat-bubble-leader' : ''}`}
        style={{ background: swatch.background, color: swatch.color }}
      >
        <span aria-hidden="true">{initials}</span>
      </button>
      <span className="rt-waiting-seat-name" data-placement={namePlacement} role="tooltip">
        {displayName}
      </span>
    </div>
  );
}
