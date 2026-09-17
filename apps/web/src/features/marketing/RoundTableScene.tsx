import { initialsFromName, SEAT_PALETTE, seatPositions } from '../sessions/waitingRoomSeats';

export interface DemoSeat {
  name: string;
  leader?: boolean;
  speaking?: boolean;
}

interface RoundTableSceneProps {
  seats: readonly DemoSeat[];
  joinCode?: string;
  showNames?: boolean;
  className?: string;
}

/**
 * Decorative top-down table. Reuses waiting-room paint so the landing
 * looks like the product, without session or voice state.
 */
export function RoundTableScene({
  seats,
  joinCode = 'K7M-2P',
  showNames = false,
  className = '',
}: RoundTableSceneProps) {
  const positions = seatPositions(seats.length);

  return (
    <div className={`relative aspect-square w-full ${className}`} aria-hidden="true">
      <div className="rt-waiting-table pointer-events-none" />
      <div className="absolute inset-[16%] z-10 flex items-center justify-center">
        <span className="rounded-full border border-rt-secondary/20 bg-white px-3 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase shadow-sm">
          Join {joinCode}
        </span>
      </div>
      {seats.map((seat, index) => {
        const spot = positions[index];
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length];
        if (!spot || !swatch) return null;
        const initials = initialsFromName(seat.name);
        const namePlacement = 'below';

        return (
          <div
            key={seat.name}
            className="rt-waiting-seat"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            {seat.leader ? (
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.08em] text-rt-secondary-deep uppercase">
                Leader
              </span>
            ) : null}
            <span className="rt-voice-seat" data-size="lobby" data-speaking={seat.speaking ? 'true' : undefined}>
              <span
                className={`rt-waiting-seat-bubble ${seat.leader ? 'rt-waiting-seat-bubble-leader' : ''}`}
                style={{ background: swatch.background, color: swatch.color }}
              >
                <span aria-hidden="true">{initials}</span>
              </span>
            </span>
            {showNames ? (
              <span className="rt-waiting-seat-name" data-placement={namePlacement} data-always>
                {seat.name}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
