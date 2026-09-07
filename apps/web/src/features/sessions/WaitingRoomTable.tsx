import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SessionUserPayload } from '@roundtable/shared/events';

import { WaitingRoomSeat } from './WaitingRoomSeat';
import {
  colorsForParticipants,
  idsThatJustJoined,
  initialsFromName,
  orderSeats,
  seatPositions,
  type SeatSwatch,
} from './waitingRoomSeats';

interface WaitingRoomTableProps {
  participants: SessionUserPayload[] | null;
  leaderId: string;
  children?: ReactNode;
}

interface LeavingSeat {
  id: string;
  displayName: string;
  swatch: SeatSwatch;
  wasLeader: boolean;
  x: number;
  y: number;
}

const FALLBACK_SWATCH: SeatSwatch = { background: '#4d6a74', color: '#ffffff' };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Top-down circular tabletop. The disc holds the start/wait control;
 * seats sit just outside the rim and keep `user.id` as their React key
 * so they slide when the ring reflows.
 */
export function WaitingRoomTable({ participants, leaderId, children }: WaitingRoomTableProps) {
  const ordered = useMemo(
    () => orderSeats(participants ?? [], leaderId),
    [participants, leaderId],
  );
  const colors = useMemo(
    () => colorsForParticipants(ordered.map((person) => person.id)),
    [ordered],
  );
  const positions = useMemo(() => seatPositions(ordered.length), [ordered.length]);

  const seenRef = useRef<Set<string> | null>(null);
  const infoRef = useRef<Map<string, { displayName: string; swatch: SeatSwatch; wasLeader: boolean }>>(
    new Map(),
  );
  const lastPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const [justJoined, setJustJoined] = useState<Set<string>>(() => new Set());
  const [leaving, setLeaving] = useState<LeavingSeat[]>([]);

  useLayoutEffect(() => {
    if (participants === null) return;

    const ids = ordered.map((person) => person.id);
    const seen = seenRef.current;
    const reduced = prefersReducedMotion();

    if (seen === null) {
      seenRef.current = new Set(ids);
      setJustJoined(new Set());
    } else {
      setJustJoined(idsThatJustJoined(seen, ids));

      const current = new Set(ids);
      const departed = [...seen].filter((id) => !current.has(id));
      if (departed.length > 0 && !reduced) {
        setLeaving((prev) => {
          const next = prev.filter((seat) => !current.has(seat.id) && !departed.includes(seat.id));
          for (const id of departed) {
            const info = infoRef.current.get(id);
            const pos = lastPosRef.current.get(id);
            if (!info || !pos) continue;
            next.push({
              id,
              displayName: info.displayName,
              swatch: info.swatch,
              wasLeader: info.wasLeader,
              x: pos.x,
              y: pos.y,
            });
          }
          return next;
        });
      }

      for (const id of ids) seen.add(id);
      for (const id of departed) seen.delete(id);
    }

    ordered.forEach((person, index) => {
      infoRef.current.set(person.id, {
        displayName: person.displayName,
        swatch: colors[person.id] ?? FALLBACK_SWATCH,
        wasLeader: person.id === leaderId,
      });
      const spot = positions[index];
      if (spot) lastPosRef.current.set(person.id, spot);
    });
  }, [participants, ordered, colors, positions, leaderId]);

  function clearJustJoined(id: string) {
    setJustJoined((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function finishLeaving(id: string) {
    setLeaving((prev) => prev.filter((seat) => seat.id !== id));
  }

  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = window.setTimeout(() => setLeaving([]), 220);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const presentIds = new Set(ordered.map((person) => person.id));
  const leavingVisible = leaving.filter((seat) => !presentIds.has(seat.id));

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden px-2 py-3"
      aria-label="Waiting room table"
    >
      <div className="rt-waiting-scene relative aspect-square">
        <div className="rt-waiting-table" aria-hidden="true" />
        {children ? (
          <div className="absolute inset-[14%] z-10 flex items-center justify-center">{children}</div>
        ) : null}

        {ordered.map((person, index) => {
          const spot = positions[index];
          if (!spot) return null;
          return (
            <WaitingRoomSeat
              key={person.id}
              displayName={person.displayName}
              initials={initialsFromName(person.displayName)}
              swatch={colors[person.id] ?? FALLBACK_SWATCH}
              isLeader={person.id === leaderId}
              justJoined={justJoined.has(person.id)}
              leaving={false}
              x={spot.x}
              y={spot.y}
              onArriveEnd={() => clearJustJoined(person.id)}
            />
          );
        })}

        {leavingVisible.map((seat) => (
          <WaitingRoomSeat
            key={`leaving-${seat.id}`}
            displayName={seat.displayName}
            initials={initialsFromName(seat.displayName)}
            swatch={seat.swatch}
            isLeader={seat.wasLeader}
            justJoined={false}
            leaving
            x={seat.x}
            y={seat.y}
            onLeaveEnd={() => finishLeaving(seat.id)}
          />
        ))}
      </div>
    </section>
  );
}
