import { useInView, useReducedMotion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';

import { TableScene, type TableSeatView } from '../sessions/TableScene';
import {
  HOST_SLOT,
  chairFillOrder,
  chairsFor,
  initialsFromName,
  SEAT_PALETTE,
} from '../sessions/waitingRoomSeats';
import { ProductFrame } from './ProductFrame';
import { DEMO, DEMO_QUESTIONS, DEMO_SEATS } from './story';

export interface DemoSeat {
  name: string;
  leader?: boolean;
  speaking?: boolean;
}

/** Only to satisfy the checker: the modulo cannot leave the palette. */
const DEMO_FALLBACK = { background: '#4d6a74', color: '#ffffff' };

/** Between arrivals in a batch, the way a lobby actually fills. */
const ARRIVAL_GAP_MS = 120;

/** Set for the whole demo room, so the table does not regrow as it fills. */
const DEMO_CHAIRS = chairsFor(DEMO_SEATS.length);

interface RoundTableSceneProps {
  seats: readonly DemoSeat[];
  joinCode?: string;
  /** Seats arrive one after another, once the table is in view. */
  stagger?: boolean;
  className?: string;
}

/**
 * The waiting room's own table (`TableScene`), so the landing page shows the
 * real lobby rather than an illustration of it: the same chairs, place cards,
 * crown and speaking light. No session, socket or voice state — the seats are
 * fixed props, seated the way the lobby seats people: the leader at the head,
 * everyone else filling in either side.
 */
export function RoundTableScene({
  seats,
  joinCode = DEMO.joinCode,
  stagger = false,
  className = '',
}: RoundTableSceneProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const animate = stagger && !reduce;
  // Nobody sits down until the table is on screen, so the arrivals are seen.
  const shown = !animate || inView;
  // How many were there to seat when it came into view: those arrive one after
  // another; anyone who turns up later (the hero fills over time) arrives as
  // they come. Stored the render the table is first shown, before it paints.
  const [batch, setBatch] = useState<number | null>(null);
  if (shown && batch === null) setBatch(seats.length);

  const order = chairFillOrder(DEMO_CHAIRS);
  let next = 0;
  const views: TableSeatView[] = shown
    ? seats.map((seat, index) => {
        const slot = seat.leader ? HOST_SLOT : (order[next++] ?? 0);
        const swatch = SEAT_PALETTE[index % SEAT_PALETTE.length] ?? DEMO_FALLBACK;
        return {
          id: seat.name,
          name: seat.name,
          initials: initialsFromName(seat.name),
          swatch,
          slot,
          isLeader: Boolean(seat.leader),
          isSpeaking: Boolean(seat.speaking),
          ...(animate ? { motion: 'joining' as const } : {}),
          ...(animate && batch !== null && index < batch
            ? { delayMs: index * ARRIVAL_GAP_MS }
            : {}),
        };
      })
    : [];

  return (
    <div ref={ref} className={`relative aspect-square w-full ${className}`}>
      <TableScene
        chairs={DEMO_CHAIRS}
        seats={views}
        decorative
        centre={
          <span className="rounded-full border border-rt-secondary/25 bg-white px-3.5 py-1.5 text-[10px] font-semibold tracking-[0.14em] text-rt-ink-faint uppercase shadow-sm">
            Join {joinCode}
          </span>
        }
      />
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
        <div className="mx-auto w-[88%] py-3">
          <RoundTableScene seats={seats} stagger={stagger} joinCode={DEMO.joinCode} />
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
