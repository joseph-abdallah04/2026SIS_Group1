import { motion, useReducedMotion } from 'motion/react';

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
  /** Seats arrive one after another, the way a lobby actually fills. */
  stagger?: boolean;
  className?: string;
}

/**
 * Decorative top-down tabletop, painted with the waiting room's own CSS so the
 * landing page shows the real lobby rather than an illustration of it. No
 * session, socket or voice state — the seats are fixed props.
 */
export function RoundTableScene({
  seats,
  joinCode = 'RT-4821',
  showNames = false,
  stagger = false,
  className = '',
}: RoundTableSceneProps) {
  const reduce = useReducedMotion();
  const positions = seatPositions(seats.length);
  const animateSeats = stagger && !reduce;

  return (
    <div className={`relative aspect-square w-full ${className}`} aria-hidden="true">
      <div className="rt-waiting-table pointer-events-none" />

      <div className="absolute inset-[16%] z-10 flex items-center justify-center">
        <motion.span
          initial={animateSeats ? { y: 8 } : false}
          whileInView={{ y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: seats.length * 0.12 + 0.1, duration: 0.5 }}
          className="rounded-full border border-rt-secondary/25 bg-white px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase shadow-sm"
        >
          Join {joinCode}
        </motion.span>
      </div>

      {seats.map((seat, index) => {
        const spot = positions[index];
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length];
        if (!spot || !swatch) return null;

        return (
          <motion.div
            key={seat.name}
            className="rt-waiting-seat"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            initial={animateSeats ? { scale: 0.6 } : false}
            whileInView={{ scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{
              delay: index * 0.12,
              type: 'spring',
              stiffness: 260,
              damping: 18,
            }}
          >
            {seat.leader ? (
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.08em] text-rt-secondary-deep uppercase">
                Leader
              </span>
            ) : null}
            <span
              className="rt-voice-seat"
              data-size="lobby"
              data-speaking={seat.speaking ? 'true' : undefined}
            >
              <span
                className={`rt-waiting-seat-bubble ${seat.leader ? 'rt-waiting-seat-bubble-leader' : ''}`}
                style={{ background: swatch.background, color: swatch.color }}
              >
                <span>{initialsFromName(seat.name)}</span>
              </span>
            </span>
            {showNames ? (
              <span className="rt-waiting-seat-name" data-placement="below" data-always>
                {seat.name}
              </span>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}
