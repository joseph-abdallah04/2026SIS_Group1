import type { CSSProperties, ReactNode } from 'react';
import { Crown, MicOff } from 'lucide-react';

import {
  HOST_SLOT,
  SEAT_RING_PERCENT,
  seatPositions,
  seatSizePercent,
  type SeatSwatch,
} from './waitingRoomSeats';

/** One person at the table, as the scene draws them. */
export interface TableSeatView {
  id: string;
  /** In full: the place card shortens it, the screen reader hears all of it. */
  name: string;
  initials: string;
  swatch: SeatSwatch;
  /** Which chair, counting clockwise from the host's at 12 o'clock. */
  slot: number;
  isLeader?: boolean;
  isLocal?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  motion?: 'joining' | 'leaving';
  /** Holds an arrival back, so a batch can arrive one after another. */
  delayMs?: number;
}

interface TableSceneProps {
  /** Chairs round the table, occupied or not. */
  chairs: number;
  seats: readonly TableSeatView[];
  /** The leader is not here: their chair waits, crowned, with a "Host" card. */
  hostWaiting?: boolean;
  /** On the tabletop: Start, or what everyone is waiting for. */
  centre?: ReactNode;
  /** A slow light circling the rim, so a wait looks like a room, not a freeze. */
  orbit?: boolean;
  /** Crowded: place cards only for the leader, you, and whoever is talking. */
  compact?: boolean;
  /** `lit` while the session starts: the glow swells and everyone leans in. */
  mood?: 'lit';
  /** The seats' list name. Left out for a decorative scene. */
  label?: string;
  /** A picture of a table (the landing page): hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
}

interface Point {
  left: string;
  top: string;
  '--dx': string;
  '--dy': string;
  '--rot': string;
}

/**
 * Each chair's spot, the direction it faces out from the table (for the chair
 * behind and the card in front), and the angle that turns the chair to face in.
 */
function chairPoints(chairs: number): Point[] {
  return seatPositions(chairs, SEAT_RING_PERCENT, SEAT_RING_PERCENT).map((spot, slot) => {
    const degrees = -90 + (360 * slot) / chairs;
    const radians = (degrees * Math.PI) / 180;
    return {
      left: `${spot.x.toFixed(3)}%`,
      top: `${spot.y.toFixed(3)}%`,
      '--dx': Math.cos(radians).toFixed(4),
      '--dy': Math.sin(radians).toFixed(4),
      '--rot': `${(degrees + 90).toFixed(2)}deg`,
    };
  });
}

/**
 * What each place card says: a first name, or a first name and an initial
 * where two people at the table share one.
 */
function placeCardNames(seats: readonly TableSeatView[]): Map<string, string> {
  const parts = new Map(seats.map((seat) => [seat.id, seat.name.trim().split(/\s+/)]));
  const counts = new Map<string, number>();
  for (const words of parts.values()) {
    const firstWord = words[0] ?? '';
    counts.set(firstWord, (counts.get(firstWord) ?? 0) + 1);
  }
  const names = new Map<string, string>();
  for (const [id, words] of parts) {
    const firstWord = words[0] ?? '';
    const last = words.length > 1 ? words[words.length - 1] : undefined;
    names.set(
      id,
      (counts.get(firstWord) ?? 0) > 1 && last ? `${firstWord} ${last.charAt(0)}.` : firstWord,
    );
  }
  return names;
}

/** The words a screen reader takes for one seat. Speaking is left out on purpose. */
function seatLabel(seat: TableSeatView): string {
  return [
    seat.name,
    seat.isLocal ? 'you' : null,
    seat.isLeader ? 'leader' : null,
    seat.isMuted ? 'muted' : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * A top-down round table with chairs set round it, and people in them.
 *
 * Every chair is drawn, taken or not: empty ones are tucked in, so the table
 * looks set for whoever is still coming, and an arrival slides one out and
 * drops into it. Each person wears their place card on the tabletop in front
 * of them, so names are always there to read (on a touch screen too), and the
 * leader wears the board's crown. Whoever is talking gets the board's green
 * ring, and their light pools on the table in front of them.
 *
 * Sized by its box: in a `rt-table-stage` it takes the largest square that
 * fits, so the whole table shows whatever shape the space is. Seats shrink as
 * chairs are added, before they would touch.
 *
 * The seats are a list, each item read as the person's full name and what is
 * known about them (you, leader, muted). Speaking is not in it: it changes at
 * syllable rate, and a list that rewrote itself that fast would be hostile to
 * a screen reader. The chairs, the glow and the cards are decoration.
 */
export function TableScene({
  chairs,
  seats,
  hostWaiting = false,
  centre,
  orbit = false,
  compact = false,
  mood,
  label,
  decorative = false,
  className = '',
}: TableSceneProps) {
  const seat = seatSizePercent(chairs);
  // The rim passes just under the seats' inner edge: everyone sits at it.
  const tableRadius = SEAT_RING_PERCENT - seat * 0.3;
  const inset = `${(50 - tableRadius).toFixed(2)}%`;
  const points = chairPoints(chairs);
  const bySlot = new Map(seats.map((person) => [person.slot, person]));
  const cards = placeCardNames(seats);
  const speaker = seats.find((person) => person.isSpeaking && person.motion !== 'leaving');
  const speakerPoint = speaker ? points[speaker.slot] : undefined;

  return (
    <div
      className={`rt-table-scene ${className}`}
      style={{ '--seat': `${seat.toFixed(2)}cqw` } as CSSProperties}
      data-compact={compact ? 'true' : undefined}
      data-mood={mood}
      aria-hidden={decorative ? 'true' : undefined}
    >
      <div aria-hidden="true" className="rt-table-glow" style={{ inset }} />
      <div aria-hidden="true" className="rt-table-top" style={{ inset }}>
        {speakerPoint ? (
          // Toward the speaker, two thirds of the way from the middle.
          <span
            className="rt-table-pool"
            style={{
              left: `${(50 + Number(speakerPoint['--dx']) * 32).toFixed(1)}%`,
              top: `${(50 + Number(speakerPoint['--dy']) * 32).toFixed(1)}%`,
            }}
          />
        ) : null}
      </div>
      {orbit ? <div aria-hidden="true" className="rt-table-orbit" style={{ inset }} /> : null}

      <div aria-hidden="true">
        {points.map((point, slot) => {
          const person = bySlot.get(slot);
          const host = !person && slot === HOST_SLOT && hostWaiting;
          return (
            <span
              // Chairs are places, not people: keyed by where they stand.
              key={slot}
              className="rt-table-chair"
              data-slot={slot}
              data-empty={person ? undefined : 'true'}
              data-host={host ? 'true' : undefined}
              data-anim={person?.motion}
              style={
                {
                  ...point,
                  ...(person?.delayMs ? { '--delay': `${person.delayMs}ms` } : {}),
                } as CSSProperties
              }
            >
              <span className="rt-table-chair-back" />
              {person ? null : (
                <span className="rt-table-ghost">
                  {host ? (
                    <span className="rt-table-crown">
                      <Crown size={10} strokeWidth={2.5} />
                    </span>
                  ) : null}
                </span>
              )}
              {host ? <span className="rt-table-card">Host</span> : null}
            </span>
          );
        })}
      </div>

      {centre ? (
        <div className="rt-table-centre" style={{ inset }}>
          {centre}
        </div>
      ) : null}

      <ul className="rt-table-seats" aria-label={decorative ? undefined : label}>
        {seats.map((person) => {
          const point = points[person.slot];
          if (!point) return null;
          return (
            <li
              key={person.id}
              className="rt-table-seat"
              data-slot={person.slot}
              data-anim={person.motion}
              data-speaking={person.isSpeaking ? 'true' : undefined}
              data-leader={person.isLeader ? 'true' : undefined}
              data-local={person.isLocal ? 'true' : undefined}
              // On its way out: no longer someone to read about.
              aria-hidden={person.motion === 'leaving' ? 'true' : undefined}
              title={person.name}
              style={
                {
                  ...point,
                  ...(person.delayMs ? { '--delay': `${person.delayMs}ms` } : {}),
                } as CSSProperties
              }
            >
              <span
                aria-hidden="true"
                className="rt-table-bubble"
                style={{ background: person.swatch.background, color: person.swatch.color }}
              >
                {person.initials}
                {person.isLeader ? (
                  <span className="rt-table-crown">
                    <Crown size={10} strokeWidth={2.5} />
                  </span>
                ) : null}
                {person.isMuted ? (
                  <span className="rt-table-muted">
                    <MicOff size={10} strokeWidth={2.75} />
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="rt-table-card">
                {cards.get(person.id)}
                {person.isLocal ? <span className="rt-table-you"> (you)</span> : null}
              </span>
              <span className="sr-only">{seatLabel(person)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
