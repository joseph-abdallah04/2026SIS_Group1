import { MicOff } from 'lucide-react';

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
  /**
   * Voice state, when there is any. Both default to false, and false means
   * "nothing to show" rather than "silent" — a seated person who has not
   * reached the voice room is unknown, and drawing them as muted would state
   * something about a microphone nobody has heard from.
   */
  isSpeaking?: boolean;
  isMuted?: boolean;
  onArriveEnd?: () => void;
  onLeaveEnd?: () => void;
}

/**
 * One head around the tabletop. Name is a hover/focus tooltip so the rim
 * stays initials-only.
 *
 * When voice is running, the head carries the same speaking ring and muted
 * badge the board's roster uses — the table is already the roster here, so a
 * second list of the same people would be the wrong answer. The styles are the
 * board's own `.rt-voice-*` rules rather than a copy of them.
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
  isSpeaking = false,
  isMuted = false,
  onArriveEnd,
  onLeaveEnd,
}: WaitingRoomSeatProps) {
  const namePlacement = y < 55 ? 'below' : 'above';
  // Speaking is deliberately not in here. The board's roster names it because
  // that is a list you open and read; the table is ambient, and a name that
  // changed at syllable rate would make the room hostile to a screen reader —
  // and every `getByRole` query a coin toss.
  const label = [displayName, isLeader ? 'Leader' : null, isMuted ? 'muted' : null]
    .filter(Boolean)
    .join(', ');

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
      {/* Only the button is wrapped. The name tooltip below stays a sibling:
          it positions itself against `.rt-waiting-seat`, so moving it inside
          this wrapper would re-anchor it and break its centring. */}
      <span
        className="rt-voice-seat"
        data-size="lobby"
        data-speaking={isSpeaking ? 'true' : undefined}
      >
        <button
          type="button"
          aria-label={label}
          className={`rt-waiting-seat-bubble ${isLeader ? 'rt-waiting-seat-bubble-leader' : ''}`}
          style={{ background: swatch.background, color: swatch.color }}
        >
          <span aria-hidden="true">{initials}</span>
        </button>
        {isMuted ? (
          <span className="rt-voice-bubble-muted" aria-hidden="true">
            <MicOff size={12} strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
      <span className="rt-waiting-seat-name" data-placement={namePlacement} role="tooltip">
        {displayName}
      </span>
    </div>
  );
}
