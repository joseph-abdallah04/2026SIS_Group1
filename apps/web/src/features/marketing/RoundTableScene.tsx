import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

import { initialsFromName, SEAT_PALETTE, seatPositions } from '../sessions/waitingRoomSeats';
import { ProductFrame } from './ProductFrame';
import { DEMO, DEMO_QUESTIONS } from './story';

export interface DemoSeat {
  name: string;
  leader?: boolean;
  speaking?: boolean;
}

function namePlacement(y: number): 'above' | 'below' {
  return y < 50 ? 'above' : 'below';
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
  joinCode = DEMO.joinCode,
  showNames = false,
  stagger = false,
  className = '',
}: RoundTableSceneProps) {
  const reduce = useReducedMotion();
  const positions = seatPositions(seats.length, 42, 42);
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

        const placement = namePlacement(spot.y);
        const nameAbove = showNames && placement === 'above';

        // Motion owns `transform` while it scales the seat in, which would
        // otherwise wipe the CSS `translate(-50%, -50%)` and leave the ring
        // sitting low and right of the table. `x`/`y` keep that centering
        // inside the same transform.
        return (
          <motion.div
            key={seat.name}
            className="rt-waiting-seat"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, x: '-50%', y: '-50%' }}
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
            {seat.leader && !nameAbove ? (
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
            {showNames && nameAbove && seat.leader ? (
              <span className="rt-landing-seat-caption" data-placement="above">
                <span className="rt-landing-leader-tag">Leader</span>
                <span className="rt-waiting-seat-name" data-placement="above" data-always>
                  {seat.name}
                </span>
              </span>
            ) : showNames ? (
              <span className="rt-waiting-seat-name" data-placement={placement} data-always>
                {seat.name}
              </span>
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}

/** Same lobby card in the hero and the how-it-runs film. */
export function LandingLobby({
  seats,
  stagger = false,
  footer,
}: {
  seats: readonly DemoSeat[];
  stagger?: boolean;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <ProductFrame
        title={DEMO.title}
        meta={`${DEMO.team} · ${DEMO_QUESTIONS.length} questions`}
        badge="Lobby"
        footer={footer}
      >
        <div className="rt-landing-scene mx-auto w-[72%] pt-14 pb-10">
          <RoundTableScene seats={seats} showNames stagger={stagger} joinCode={DEMO.joinCode} />
        </div>
      </ProductFrame>
    </div>
  );
}

export function LobbyFooter({ status, ready }: { status: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-[12px] font-medium text-rt-ink-muted">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rt-secondary opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rt-secondary-deep" />
        </span>
        {status}
      </p>
      <span
        className={`rounded-full px-3.5 py-1.5 text-[11.5px] font-semibold shadow-sm ${
          ready
            ? 'bg-rt-secondary text-rt-ink'
            : 'bg-white text-rt-ink-faint ring-1 ring-rt-secondary/20'
        }`}
      >
        {ready ? 'Start session' : 'Waiting…'}
      </span>
    </div>
  );
}
